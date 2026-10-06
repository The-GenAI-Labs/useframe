// Image naming and tagging contract shared by scripts/docker.mjs and CI (and relied on by the Helm chart).
import { readFileSync } from "node:fs";

export const REGISTRY = "docker.io";
export const NAMING_MODES = ["per-service", "single-repo"];

export function loadServices(servicesFile) {
  return JSON.parse(readFileSync(servicesFile, "utf8"));
}

export function selectServices(all, which) {
  if (!which || which === "all") return all;
  const match = all.filter((s) => s.name === which);
  if (match.length === 0) {
    throw new Error(`Unknown service "${which}". Known: ${all.map((s) => s.name).join(", ")}`);
  }
  return match;
}

export function requireNamespace(env) {
  const ns = (env.DOCKERHUB_NAMESPACE ?? "").trim();
  if (!ns) throw new Error("DOCKERHUB_NAMESPACE is not set (your Docker Hub user or organisation). There is no default.");
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(ns)) throw new Error(`DOCKERHUB_NAMESPACE "${ns}" is not a valid Docker Hub namespace`);
  return ns;
}

export function namingMode(env) {
  const mode = (env.DOCKER_IMAGE_NAMING ?? "").trim() || "per-service";
  if (!NAMING_MODES.includes(mode)) throw new Error(`DOCKER_IMAGE_NAMING must be one of ${NAMING_MODES.join(", ")}`);
  return mode;
}

export function computeTags({ sha, ref = "", dirty = false }) {
  if (!/^[0-9a-f]{7,40}$/.test(sha ?? "")) throw new Error(`Invalid git sha "${sha}"`);
  const tags = [`sha-${sha.slice(0, 7)}${dirty ? "-dirty" : ""}`];
  if (!dirty) {
    const version = /^refs\/tags\/v(\d+\.\d+\.\d+)$/.exec(ref);
    if (version) tags.push(version[1]);
    if (ref === "refs/heads/main") tags.push("main");
  }
  for (const tag of tags) assertTagAllowed(tag);
  return tags;
}

export function assertTagAllowed(tag) {
  if (tag === "latest" || /(^|-)latest$/.test(tag)) throw new Error('Refusing to create a "latest" tag');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)) throw new Error(`Invalid Docker tag "${tag}"`);
}

export function assertPushable(tag) {
  assertTagAllowed(tag);
  if (tag.endsWith("-dirty")) throw new Error(`Refusing to push "${tag}": built from a dirty working tree`);
}

export function imageRef({ namespace, naming = "per-service", service, tag }) {
  assertTagAllowed(tag);
  if (naming === "single-repo") {
    const combined = `${service}-${tag}`;
    assertTagAllowed(combined);
    return `${REGISTRY}/${namespace}/useframe:${combined}`;
  }
  if (naming !== "per-service") throw new Error(`Unknown naming mode "${naming}"`);
  return `${REGISTRY}/${namespace}/useframe-${service}:${tag}`;
}

export function imageRefs({ namespace, naming, service, tags }) {
  return tags.map((tag) => imageRef({ namespace, naming, service, tag }));
}
