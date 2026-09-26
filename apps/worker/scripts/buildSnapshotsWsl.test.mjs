import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  lstat,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshot } from "@webcontainer/snapshot";
import { prepareSnapshotBinaries, verifyBinary } from "./buildSnapshotsWsl.mjs";

async function fixture(t, type = "commonjs") {
  const root = await mkdtemp(path.join(tmpdir(), "snapshot-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "node_modules/.bin"), { recursive: true });
  await mkdir(path.join(root, "node_modules/example/bin"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type }));
  await writeFile(
    path.join(root, "node_modules/example/package.json"),
    JSON.stringify({ type }),
  );
  const cli =
    type === "module"
      ? "#!/usr/bin/env node\nimport { version } from './version.js'; console.log(version)"
      : "#!/usr/bin/env node\nconsole.log(require('./version.js'))";
  await writeFile(path.join(root, "node_modules/example/bin/cli.js"), cli, {
    mode: 0o755,
  });
  await writeFile(
    path.join(root, "node_modules/example/bin/version.js"),
    type === "module"
      ? "export const version = '1.0.0'"
      : "module.exports = '1.0.0'",
  );
  await symlink(
    "../example/bin/cli.js",
    path.join(root, "node_modules/.bin/example"),
  );
  return root;
}

for (const type of ["commonjs", "module"]) {
  test(`packages a runnable ${type} launcher with working relative imports`, async (t) => {
    const root = await fixture(t, type);
    await verifyBinary(root, "example");
    await prepareSnapshotBinaries(root);
    const launcher = path.join(root, "node_modules/.bin/example");
    assert.equal((await lstat(launcher)).isSymbolicLink(), false);
    assert.match(await readFile(launcher, "utf8"), /^#!\/usr\/bin\/env node/);
    await verifyBinary(root, "example");
    const buffer = await snapshot(root);
    assert.ok(buffer.includes(Buffer.from('import("../example/bin/cli.js")')));
  });
}

test("rejects an absent executable instead of publishing a broken snapshot", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "node_modules/.bin/example"));
  await assert.rejects(verifyBinary(root, "example"), /ENOENT/);
});

test("rejects dangling symlinks", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "node_modules/example/bin/cli.js"));
  await assert.rejects(prepareSnapshotBinaries(root), /ENOENT/);
});

test("rejects symlinks outside the dependency tree", async (t) => {
  const root = await fixture(t);
  await symlink(
    "../../package.json",
    path.join(root, "node_modules/.bin/outside"),
  );
  await assert.rejects(
    prepareSnapshotBinaries(root),
    /Unsupported snapshot symlink/,
  );
});
