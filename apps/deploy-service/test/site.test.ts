import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { computeDesiredEntries, orderWrites } from "@/site/desired.js";
import { KvContractError, kvKeyForHost, serializeValue } from "@/site/kvContract.js";
import { buildLabel, isValidLabel, randomSuffix, RESERVED_LABELS, slugifyName } from "@/site/label.js";
import { ensureSite } from "@/site/ensureSite.js";
import { applyEntries } from "@/site/sync.js";

describe("subdomain labels", () => {
  it.each([
    ["Acme Vet Clinic", "acme-vet-clinic"],
    ["  Café   Déjà Vu!! ", "cafe-deja-vu"],
    ["xn--evil", "xn-evil"],
    ["a -- b", "a-b"],
    ["---", "site"],
    ["", "site"],
    ["日本語", "site"],
    ["a".repeat(80), "a".repeat(30)],
    ["abcdefghijklmnopqrstuvwxyz abcd-efg", "abcdefghijklmnopqrstuvwxyz-abc"],
  ])("slugifies %j", (name, slug) => {
    expect(slugifyName(name)).toBe(slug);
  });

  it("never yields '--', a leading xn--, or a trailing dash before the suffix", () => {
    for (const name of ["x--y", "-lead", "trail-", "a".repeat(29) + "-b", "xn--foo"]) {
      const label = buildLabel(name, "b2c");
      expect(label).not.toContain("--");
      expect(label.startsWith("xn--")).toBe(false);
      expect(isValidLabel(label)).toBe(true);
      expect(label.length).toBeLessThanOrEqual(63);
    }
  });

  it("draws suffixes from the vowel-free alphabet", () => {
    const suffix = randomSuffix(200);
    expect(suffix).toMatch(/^[bcdfghjkmnpqrstvwxyz2-9]+$/);
  });

  it("rejects reserved labels", () => {
    for (const label of RESERVED_LABELS) expect(isValidLabel(label)).toBe(false);
  });

  it("retries collisions and moves to a 4-char suffix", async () => {
    const created: string[] = [];
    const db = {
      projectSite: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: { subdomainLabel: string } }) => {
          created.push(data.subdomainLabel);
          if (created.length <= 5) throw Object.assign(new Error("dup"), { code: "P2002" });
          return data;
        }),
      },
      project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ name: "Acme" }) },
    };
    let n = 0;
    const site = await ensureSite(db as never, "p1", "useframe.in", (len) => `${"bcdfg".slice(0, len)}${n++}`.slice(-len));
    expect(created).toHaveLength(6);
    expect((site as { subdomainLabel: string }).subdomainLabel).toMatch(/^acme-[a-z0-9]{4}$/);
  });
});

const WRITES_LABEL = /\b(subdomainLabel|defaultHost)\s*:/;

describe("label immutability guard", () => {
  it("flags a write but not a read", () => {
    expect(WRITES_LABEL.test("projectSite.update({ data: { defaultHost: x } })")).toBe(true);
    expect(WRITES_LABEL.test("projectSite.update({ data: { primaryHost: site.defaultHost } })")).toBe(false);
  });

  it("no code path updates subdomainLabel or defaultHost", async () => {
    const root = path.resolve(__dirname, "../../..");
    const roots = ["apps/deploy-service/src", "apps/server/src", "apps/worker/src", "apps/orchestrator-service/src"];
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.ts$/.test(entry.name)) {
          const source = await readFile(full, "utf-8");
          const updates = source.match(/projectSite\.(update|updateMany|upsert)\([\s\S]*?\}\s*\)/g) ?? [];
          for (const call of updates) {
            // A write names the field as a key; reading it as a value is fine.
            if (WRITES_LABEL.test(call)) offenders.push(path.relative(root, full));
          }
        }
      }
    }
    for (const r of roots) await walk(path.join(root, r));
    expect(offenders).toEqual([]);
  });
});

describe("desired KV state", () => {
  const base = { defaultHost: "acme-x7k.useframe.in", primaryHost: "acme-x7k.useframe.in" };
  const active = { projectId: "p1", deploymentId: "d1", mode: "n" as const };

  it("serves the default host when it is primary and active", () => {
    const entries = computeDesiredEntries({ ...base, suspended: false, active });
    expect(entries.get("acme-x7k.useframe.in")).toEqual({ v: 1, t: "p", k: "p1/d1", m: "n" });
  });

  it("writes no key before the first deployment", () => {
    const entries = computeDesiredEntries({ ...base, suspended: false, active: null });
    expect(entries.get("acme-x7k.useframe.in")).toBeNull();
  });

  it("suspends every owned host", () => {
    const entries = computeDesiredEntries({ ...base, primaryHost: "www.acme.com", suspended: true, active });
    expect(entries.get("acme-x7k.useframe.in")).toEqual({ v: 1, t: "x" });
    expect(entries.get("www.acme.com")).toEqual({ v: 1, t: "x" });
  });

  it("redirects the default host once a custom primary exists (Stage 2 data)", () => {
    const entries = computeDesiredEntries({ ...base, primaryHost: "www.acme.com", suspended: false, active });
    expect(entries.get("acme-x7k.useframe.in")).toEqual({ v: 1, t: "r", u: "https://www.acme.com" });
    expect(entries.get("www.acme.com")).toEqual({ v: 1, t: "p", k: "p1/d1", m: "n" });
  });

  it("deletes hosts the site no longer owns", () => {
    const entries = computeDesiredEntries({ ...base, suspended: false, active }, ["Old.Acme.com"]);
    expect(entries.get("old.acme.com")).toBeNull();
  });

  it("orders serve entries, then suspensions/redirects, then deletes", async () => {
    const entries = computeDesiredEntries({ ...base, primaryHost: "www.acme.com", suspended: false, active }, [
      "gone.acme.com",
    ]);
    const calls: string[] = [];
    await applyEntries(
      {
        put: async (key) => {
          calls.push(`put ${key}`);
        },
        delete: async (key) => {
          calls.push(`delete ${key}`);
        },
      },
      entries,
    );
    expect(calls).toEqual(["put h:www.acme.com", "put h:acme-x7k.useframe.in", "delete h:gone.acme.com"]);
    expect(orderWrites(entries).puts[0]![1].t).toBe("p");
  });
});

describe("KV contract", () => {
  it("serializes valid values compactly", () => {
    expect(serializeValue({ v: 1, t: "p", k: "abc/def", m: "s" })).toBe('{"v":1,"t":"p","k":"abc/def","m":"s"}');
  });

  it.each([
    [{ v: 1, t: "r", u: "https://acme.com/" }],
    [{ v: 1, t: "r", u: "http://acme.com" }],
    [{ v: 1, t: "p", k: "../etc", m: "n" }],
    [{ v: 1, t: "p", k: "a/b", m: "n", extra: 1 }],
  ])("throws on %j instead of writing garbage", (value) => {
    expect(() => serializeValue(value as never)).toThrow(KvContractError);
  });

  it("requires lowercase hostnames for keys", () => {
    expect(kvKeyForHost("acme.useframe.in")).toBe("h:acme.useframe.in");
    expect(() => kvKeyForHost("Acme.useframe.in")).toThrow(KvContractError);
  });
});
