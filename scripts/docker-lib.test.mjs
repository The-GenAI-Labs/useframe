import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPushable,
  computeTags,
  imageRef,
  imageRefs,
  loadServices,
  namingMode,
  requireNamespace,
  selectServices,
} from "./docker-lib.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

test("always tags sha-<7>", () => {
  assert.deepEqual(computeTags({ sha: SHA, ref: "refs/heads/feature/x" }), ["sha-3d3c42e"]);
});

test("adds main on main and X.Y.Z on a version tag", () => {
  assert.deepEqual(computeTags({ sha: SHA, ref: "refs/heads/main" }), ["sha-3d3c42e", "main"]);
  assert.deepEqual(computeTags({ sha: SHA, ref: "refs/tags/v1.4.2" }), ["sha-3d3c42e", "1.4.2"]);
  assert.deepEqual(computeTags({ sha: SHA, ref: "refs/tags/release-1" }), ["sha-3d3c42e"]);
});

test("dirty builds get only a -dirty tag and cannot be pushed", () => {
  const tags = computeTags({ sha: SHA, ref: "refs/heads/main", dirty: true });
  assert.deepEqual(tags, ["sha-3d3c42e-dirty"]);
  assert.throws(() => assertPushable(tags[0]), /dirty/);
  assert.doesNotThrow(() => assertPushable("sha-3d3c42e"));
});

test("refuses latest everywhere", () => {
  assert.throws(() => assertPushable("latest"), /latest/);
  assert.throws(() => imageRef({ namespace: "acme", service: "server", tag: "latest" }), /latest/);
});

test("rejects a bad sha", () => {
  assert.throws(() => computeTags({ sha: "nothex!" }), /Invalid git sha/);
});

test("per-service naming", () => {
  assert.equal(
    imageRef({ namespace: "acme", naming: "per-service", service: "orchestrator-service", tag: "sha-3d3c42e" }),
    "docker.io/acme/useframe-orchestrator-service:sha-3d3c42e",
  );
  assert.equal(imageRef({ namespace: "acme", service: "migrate", tag: "1.4.2" }), "docker.io/acme/useframe-migrate:1.4.2");
});

test("single-repo naming", () => {
  assert.deepEqual(imageRefs({ namespace: "acme", naming: "single-repo", service: "server", tags: ["sha-3d3c42e", "main"] }), [
    "docker.io/acme/useframe:server-sha-3d3c42e",
    "docker.io/acme/useframe:server-main",
  ]);
});

test("namespace is required and validated; naming mode defaults to per-service", () => {
  assert.throws(() => requireNamespace({}), /DOCKERHUB_NAMESPACE is not set/);
  assert.throws(() => requireNamespace({ DOCKERHUB_NAMESPACE: "Bad Name" }), /not a valid/);
  assert.equal(requireNamespace({ DOCKERHUB_NAMESPACE: "acme" }), "acme");
  assert.equal(namingMode({}), "per-service");
  assert.equal(namingMode({ DOCKER_IMAGE_NAMING: "single-repo" }), "single-repo");
  assert.throws(() => namingMode({ DOCKER_IMAGE_NAMING: "nope" }), /must be one of/);
});

test("service list is consistent with the repo", () => {
  const services = loadServices(new URL("../docker/services.json", import.meta.url));
  assert.ok(services.length >= 8);
  assert.equal(selectServices(services, "all").length, services.length);
  assert.equal(selectServices(services, "server")[0].dir, "apps/server");
  assert.throws(() => selectServices(services, "web"), /Unknown service/);
  for (const s of services) assert.ok(!["web", "site-edge"].includes(s.name));
});
