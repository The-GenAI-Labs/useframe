import path from "node:path";
import type { DeployRunJobPayload } from "@repo/events";
import { QUEUES } from "@repo/events";
import { ensureValidationRun } from "@useframe/db";
import type { Deps } from "@/deps.js";
import { projectLockKey, releaseLock } from "@/lib/locks.js";
import { errorMessage, log, metric } from "@/lib/logger.js";
import { syncSiteToKvs } from "@/site/sync.js";
import { buildChildEnv, INSTALL_ARGS, runChild, type ChildResult } from "./build.js";
import { dependencyHash, detectFramework, readPackageJson } from "./detect.js";
import { DeployError, publicReason } from "./errors.js";
import { getBuildableFiles } from "./files.js";
import { failDeployment, goLive, tail, transition } from "./lifecycle.js";
import { copyTemplate, prepareWorkDir, removeWorkDir, writeTree, type WorkDirs } from "./materialize.js";
import { probeDeployment } from "./probe.js";
import { storagePrefixFor, uploadOutput, verifyUpload } from "./upload.js";
import { verifyOutput } from "./verifyOutput.js";

const NATIVE_HINT = /\.node\b|node-gyp|prebuild|was compiled against|Could not locate the bindings file/i;

function checkChild(step: "install" | "build", result: ChildResult): void {
  if (result.timedOut) {
    throw new DeployError(step === "install" ? "Installing dependencies timed out." : "The build timed out.");
  }
  if (result.code === 0) return;
  if (NATIVE_HINT.test(result.output)) {
    throw new DeployError(
      "The build needs a dependency install script, which is disabled for security.",
      `${step} exited with ${result.code ?? result.signal}`,
    );
  }
  throw new DeployError(
    step === "install" ? "Installing dependencies failed." : "The site failed to build.",
    `${step} exited with ${result.code ?? result.signal}`,
  );
}

export async function runDeployment(deps: Deps, job: DeployRunJobPayload): Promise<void> {
  const { deploymentId, projectId, siteId } = job;
  const started = Date.now();
  const { config } = deps;
  const owner = config.isolation === "setpriv" ? { uid: config.buildUid, gid: config.buildGid } : null;
  let dirs: WorkDirs | undefined;
  let buildLog = "";
  let pointedKvAtThis = false;
  const step = (name: string, since: number) =>
    log.info("deploy step", { deploymentId, projectId, step: name, durationMs: Date.now() - since });

  try {
    if (!(await transition(deps, deploymentId, ["QUEUED"], { status: "BUILDING" }))) {
      log.info("deployment no longer queued; skipping", { deploymentId });
      return;
    }
    const site = await deps.db.projectSite.findUniqueOrThrow({
      where: { id: siteId },
      select: { primaryHost: true },
    });
    const siteUrl = `https://${site.primaryHost}`;

    let t = Date.now();
    const files = await getBuildableFiles(deps.db, job.versionId, siteUrl);
    const detected = detectFramework(files);
    dirs = await prepareWorkDir(config.workDir, deploymentId, owner);
    await writeTree(dirs.src, files, owner);
    step("materialize", t);

    const childEnv = buildChildEnv({ home: dirs.home, npmCache: dirs.npmCache, path: process.env.PATH });
    const run = (args: string[], timeoutMs: number) =>
      runChild({
        command: "npm",
        args,
        cwd: dirs!.src,
        env: childEnv,
        timeoutMs,
        isolation: config.isolation,
        uid: config.buildUid,
        gid: config.buildGid,
      });

    t = Date.now();
    const hash = dependencyHash(readPackageJson(files));
    const fromTemplate = await copyTemplate(config.templatesRoot, hash, dirs.src, owner);
    if (!fromTemplate) {
      const install = await run(
        INSTALL_ARGS,
        config.installTimeoutMs,
      );
      buildLog += install.output;
      checkChild("install", install);
    }
    step(fromTemplate ? "install:template" : "install", t);

    t = Date.now();
    const build = await run(["run", "build"], config.buildTimeoutMs);
    buildLog += build.output;
    checkChild("build", build);
    const buildMs = Date.now() - t;
    step("build", t);
    metric("deploy.build_duration_ms", buildMs, { deploymentId, framework: detected.framework });

    const output = await verifyOutput(path.join(dirs.src, detected.outDir), {
      maxFiles: config.maxFiles,
      maxTotalBytes: config.maxTotalBytes,
    });
    if (output.skipped.length) log.warn("skipped denied output files", { deploymentId, files: output.skipped });

    const prefix = storagePrefixFor(projectId, deploymentId);
    const toUploading = await transition(deps, deploymentId, ["BUILDING"], {
      status: "UPLOADING",
      framework: detected.framework,
      storagePrefix: prefix,
      fileCount: output.fileCount,
      totalBytes: BigInt(output.totalBytes),
      rootHtmlSha256: output.rootHtmlSha256,
      siteUrl,
      buildLog: tail(buildLog),
    });
    if (!toUploading) return;

    t = Date.now();
    await uploadOutput(deps.r2, prefix, output.files);
    await verifyUpload(deps.r2, prefix, output.fileCount, output.rootHtmlSha256);
    metric("deploy.upload_duration_ms", Date.now() - t, { deploymentId, files: output.fileCount });
    step("upload", t);

    if (!(await transition(deps, deploymentId, ["UPLOADING"], { status: "ACTIVATING" }))) return;

    t = Date.now();
    pointedKvAtThis = true;
    await syncSiteToKvs(deps, siteId, { activeDeploymentId: deploymentId });
    const probe = await probeDeployment({
      url: `${siteUrl}/`,
      deploymentId,
      timeoutMs: config.probeTimeoutMs,
      intervalMs: config.probeIntervalMs,
      fetchImpl: deps.fetchImpl,
    });
    metric("deploy.probe_duration_ms", probe.elapsedMs, { deploymentId, ok: probe.ok, attempts: probe.attempts });
    if (!probe.ok) {
      throw new DeployError(
        "Activation verification failed: the new version did not come online in time.",
        `last status ${probe.lastStatus}`,
      );
    }

    const live = await goLive(
      deps,
      { id: deploymentId, projectId, versionId: job.versionId, siteId },
      siteUrl,
      Date.now() - started,
    );
    if (!live) {
      // Reaped or cancelled while activating: put KV back to what the DB says.
      await syncSiteToKvs(deps, siteId);
      return;
    }
    await releaseLock(deps.redis, projectLockKey(projectId), deploymentId);
    step("activate", t);
    metric("deploy.succeeded", 1, { deploymentId, projectId, framework: detected.framework });

    if (config.enqueueValidation && deps.validationQueue) {
      const run = await ensureValidationRun(projectId, job.versionId, "MAIN").catch(() => null);
      if (run?.status === "QUEUED") {
        await deps.validationQueue
          .add("validate", { runId: run.id }, { jobId: run.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 })
          .catch((err) => log.warn("validation enqueue failed", { deploymentId, error: errorMessage(err) }));
      }
    }
  } catch (err) {
    log.error("deployment error", { deploymentId, projectId, error: errorMessage(err) });
    await failDeployment(deps, deploymentId, publicReason(err), {
      buildLog: `${buildLog}\n${errorMessage(err)}`,
      resyncKv: pointedKvAtThis,
    });
  } finally {
    if (dirs) {
      await removeWorkDir(dirs.base).catch((err) =>
        log.warn("work dir cleanup failed", { deploymentId, error: errorMessage(err) }),
      );
    }
  }
}

export const VALIDATION_QUEUE = QUEUES.VALIDATE_MAIN;
