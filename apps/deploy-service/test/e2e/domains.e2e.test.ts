// Real Cloudflare + real DNS + real HTTPS. Never runs by default.
//   DEPLOY_E2E_CF=1 SPIKE_CUSTOM_HOSTNAME=www.<domain you control> E2E_PROJECT_ID=<project with a live deploy> \
//   CUSTOM_DOMAINS_ENABLED=true pnpm --filter @useframe/deploy-service exec vitest run test/e2e
import { describe, expect, it } from "vitest";

const enabled = process.env.DEPLOY_E2E_CF === "1" && !!process.env.SPIKE_CUSTOM_HOSTNAME && !!process.env.E2E_PROJECT_ID;
const suite = enabled ? describe : describe.skip;

suite("custom domain end to end (real Cloudflare)", () => {
  it(
    "connect → active → default host redirects → remove → default host serves",
    async () => {
      const { domainDeps, closeContext } = await import("@/context.js");
      const { addDomain, removeDomain } = await import("@/domains/service.js");
      const { tick, runUntilSettled } = await import("@/domains/machine.js");
      if (!domainDeps) throw new Error("CUSTOM_DOMAINS_ENABLED=true and CLOUDFLARE_ZONE_ID are required");
      const projectId = process.env.E2E_PROJECT_ID!;
      const hostname = process.env.SPIKE_CUSTOM_HOSTNAME!;

      const view = await addDomain(domainDeps, projectId, hostname);
      console.log("Add these records, TXT first:", JSON.stringify(view.steps.map((s) => s.record), null, 2));

      const deadline = Date.now() + 90 * 60_000;
      let status = view.status;
      while (status !== "ACTIVE" && Date.now() < deadline) {
        const next = await tick(domainDeps, view.id);
        const row = await domainDeps.db.customDomain.findUniqueOrThrow({ where: { id: view.id } });
        status = row.status;
        expect(status).not.toBe("FAILED");
        await new Promise((r) => setTimeout(r, Math.min(next ?? 30_000, 30_000)));
      }
      expect(status).toBe("ACTIVE");

      const site = await domainDeps.db.projectSite.findUniqueOrThrow({ where: { projectId } });
      const redirect = await fetch(`https://${site.defaultHost}/`, { redirect: "manual" });
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get("location")).toBe(`https://${hostname}/`);

      await removeDomain(domainDeps, projectId, view.id);
      expect(await runUntilSettled(domainDeps, view.id)).toBeNull();
      expect(await domainDeps.db.customDomain.findUnique({ where: { id: view.id } })).toBeNull();
      await closeContext();
    },
    2 * 60 * 60_000,
  );
});
