import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  transition: vi.fn(),
  fail: vi.fn(),
  goLive: vi.fn(),
  sync: vi.fn(),
  probe: vi.fn(),
  runChild: vi.fn(),
  upload: vi.fn(),
  verifyUpload: vi.fn(),
  verifyOutput: vi.fn(),
  copyTemplate: vi.fn(),
  remove: vi.fn(),
  copyMedia: vi.fn(),
  media: [] as { bytes: number }[],
}));

vi.mock("@useframe/db", () => ({ ensureValidationRun: vi.fn() }));
vi.mock("@/pipeline/lifecycle.js", () => ({
  transition: m.transition,
  failDeployment: m.fail,
  goLive: m.goLive,
  tail: (s: string) => s,
}));
vi.mock("@/site/sync.js", () => ({ syncSiteToKvs: m.sync }));
vi.mock("@/pipeline/probe.js", () => ({ probeDeployment: m.probe }));
vi.mock("@/pipeline/build.js", async (original) => ({
  ...(await original<typeof import("@/pipeline/build.js")>()),
  runChild: m.runChild,
  buildChildEnv: () => ({}),
}));
vi.mock("@/pipeline/upload.js", () => ({
  uploadOutput: m.upload,
  verifyUpload: m.verifyUpload,
  storagePrefixFor: (p: string, d: string) => `sites/${p}/${d}/`,
}));
vi.mock("@/pipeline/verifyOutput.js", () => ({ verifyOutput: m.verifyOutput }));
vi.mock("@/pipeline/materialize.js", () => ({
  prepareWorkDir: async () => ({ base: "/w/d1", src: "/w/d1/src", home: "/w/d1/home", npmCache: "/w/.npm" }),
  writeTree: async () => undefined,
  copyTemplate: m.copyTemplate,
  removeWorkDir: m.remove,
}));
vi.mock("@/pipeline/files.js", () => ({
  getBuildableFiles: async () => ({
    files: [{ path: "package.json", content: JSON.stringify({ devDependencies: { vite: "5.4.0" } }) }],
    media: m.media,
    mediaWarnings: m.media.length ? ["home/hero-0/visual: hero image is larger than 400 KB"] : [],
  }),
}));
vi.mock("@/pipeline/media.js", () => ({ copyMediaToSite: m.copyMedia }));

const { runDeployment } = await import("@/pipeline/runDeployment.js");

const job = {
  deploymentId: "d1",
  projectId: "p1",
  versionId: "v1",
  userId: "u1",
  siteId: "s1",
  triggeredBy: "user" as const,
};

function deps() {
  return {
    db: { projectSite: { findUniqueOrThrow: vi.fn().mockResolvedValue({ primaryHost: "acme-x7k.useframe.in" }) } },
    redis: { eval: vi.fn(), set: vi.fn(), get: vi.fn() },
    kv: {},
    r2: {},
    runQueue: {},
    config: {
      workDir: "/w",
      templatesRoot: "/t",
      isolation: "setpriv",
      buildUid: 10002,
      buildGid: 10002,
      installTimeoutMs: 1000,
      buildTimeoutMs: 1000,
      probeTimeoutMs: 1000,
      probeIntervalMs: 1,
      maxFiles: 10,
      maxTotalBytes: 1000,
      enqueueValidation: false,
    },
  } as never;
}

beforeEach(() => {
  for (const fn of Object.values(m)) if (typeof fn === "function") fn.mockReset();
  m.media = [];
  m.copyMedia.mockImplementation(async (_s: unknown, _d: unknown, _p: string, items: { bytes: number }[]) =>
    items.reduce((sum, i) => sum + i.bytes, 0),
  );
  m.transition.mockResolvedValue(true);
  m.copyTemplate.mockResolvedValue(true);
  m.runChild.mockResolvedValue({ code: 0, signal: null, timedOut: false, output: "built" });
  m.verifyOutput.mockResolvedValue({ files: [], skipped: [], fileCount: 1, totalBytes: 10, rootHtmlSha256: "abc" });
  m.probe.mockResolvedValue({ ok: true, attempts: 2, elapsedMs: 3000, lastStatus: 200 });
  m.goLive.mockResolvedValue(true);
  m.sync.mockResolvedValue(new Map());
  m.remove.mockResolvedValue(undefined);
});

describe("runDeployment", () => {
  it("builds, uploads, points KV as-if live, probes, then goes live", async () => {
    await runDeployment(deps(), job);
    expect(m.transition.mock.calls.map((c) => c[3].status)).toEqual(["BUILDING", "UPLOADING", "ACTIVATING"]);
    expect(m.transition.mock.calls[1]![3]).toMatchObject({
      framework: "VITE_SPA",
      storagePrefix: "sites/p1/d1/",
      siteUrl: "https://acme-x7k.useframe.in",
    });
    expect(m.runChild).toHaveBeenCalledTimes(1);
    expect(m.runChild.mock.calls[0]![0]).toMatchObject({ args: ["run", "build"], isolation: "setpriv" });
    expect(m.sync).toHaveBeenCalledWith(expect.anything(), "s1", { activeDeploymentId: "d1" });
    expect(m.probe).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://acme-x7k.useframe.in/", deploymentId: "d1" }),
    );
    expect(m.goLive).toHaveBeenCalled();
    expect(m.fail).not.toHaveBeenCalled();
    expect(m.remove).toHaveBeenCalledWith("/w/d1");
  });

  it("installs with scripts disabled when no template matches", async () => {
    m.copyTemplate.mockResolvedValue(false);
    await runDeployment(deps(), job);
    expect(m.runChild.mock.calls[0]![0].args).toEqual([
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
      "--legacy-peer-deps",
    ]);
  });

  it("restores KV from the DB and fails (with refund) when the probe times out", async () => {
    m.probe.mockResolvedValue({ ok: false, attempts: 50, elapsedMs: 150000, lastStatus: 200 });
    await runDeployment(deps(), job);
    expect(m.goLive).not.toHaveBeenCalled();
    expect(m.fail).toHaveBeenCalledWith(
      expect.anything(),
      "d1",
      expect.stringContaining("Activation verification failed"),
      expect.objectContaining({ resyncKv: true }),
    );
  });

  it("fails with a sanitized reason on a build error and cleans up", async () => {
    m.runChild.mockResolvedValue({ code: 1, signal: null, timedOut: false, output: "Error at /work/d1/src/x.tsx" });
    await runDeployment(deps(), job);
    const [, , reason, options] = m.fail.mock.calls[0]!;
    expect(reason).toBe("The site failed to build.");
    expect(options.buildLog).toContain("/work/d1/src/x.tsx");
    expect(options.resyncKv).toBe(false);
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.remove).toHaveBeenCalled();
  });

  it("reports a missing native binary instead of re-enabling scripts", async () => {
    m.runChild.mockResolvedValue({ code: 1, signal: null, timedOut: false, output: "Cannot find module ./build/Release/x.node" });
    await runDeployment(deps(), job);
    expect(m.fail.mock.calls[0]![2]).toMatch(/install script/);
  });

  it("does nothing if the deployment is no longer queued", async () => {
    m.transition.mockResolvedValueOnce(false);
    await runDeployment(deps(), job);
    expect(m.runChild).not.toHaveBeenCalled();
    expect(m.fail).not.toHaveBeenCalled();
  });

  it("re-syncs KV when it loses the race to the reaper at go-live", async () => {
    m.goLive.mockResolvedValue(false);
    await runDeployment(deps(), job);
    expect(m.sync).toHaveBeenLastCalledWith(expect.anything(), "s1");
  });

  it("copies referenced media into the deployment before the build upload, counting its files and bytes", async () => {
    m.media = [{ bytes: 300 }, { bytes: 200 }];
    const d = deps() as unknown as { mediaSource: unknown; r2: unknown };
    d.mediaSource = { bucket: "useframe-media" };
    await runDeployment(d as never, job);
    expect(m.copyMedia).toHaveBeenCalledWith(d.mediaSource, d.r2, "sites/p1/d1/", m.media);
    expect(m.transition.mock.calls[1]![3]).toMatchObject({ fileCount: 3, totalBytes: BigInt(510) });
    expect(m.verifyUpload).toHaveBeenCalledWith(expect.anything(), "sites/p1/d1/", 3, "abc");
    expect(m.copyMedia.mock.invocationCallOrder[0]).toBeLessThan(m.upload.mock.invocationCallOrder[0]!);
    expect(m.fail).not.toHaveBeenCalled();
  });

  it("fails before uploading when media would push the deployment over the size limit", async () => {
    m.media = [{ bytes: 995 }];
    await runDeployment(deps(), job);
    expect(m.fail.mock.calls[0]![2]).toMatch(/larger than/);
    expect(m.copyMedia).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("fails closed when a referenced media file is missing", async () => {
    m.media = [{ bytes: 10 }];
    const { DeployError } = await import("@/pipeline/errors.js");
    m.copyMedia.mockRejectedValue(new DeployError('The media "Team photo" is missing from storage.'));
    await runDeployment(deps(), job);
    expect(m.fail.mock.calls[0]![2]).toBe('The media "Team photo" is missing from storage.');
    expect(m.sync).not.toHaveBeenCalled();
    expect(m.goLive).not.toHaveBeenCalled();
  });
});
