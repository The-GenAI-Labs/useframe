// Builder-stage only: node docker/prune-dev-peers.mjs <pnpm deploy output dir>
// @prisma/client and drizzle-orm list the prisma CLI, typescript and PGlite as *optional* peers;
// pnpm links them because the db package has them as devDependencies, which drags the whole CLI
// tree (Studio's React UI, engines, PGlite) into every production image. Cut those optional-peer
// links, then delete whatever is no longer reachable from the service's own dependencies.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";

const DEV_ONLY_PEERS = new Set(["prisma", "typescript", "@electric-sql/pglite"]);

const out = path.resolve(process.argv[2] ?? "");
const store = path.join(out, "node_modules", ".pnpm");
if (!existsSync(store)) throw new Error(`No pnpm virtual store at ${store}`);

const entries = (dir) =>
  readdirSync(dir).flatMap((name) =>
    name.startsWith("@") ? readdirSync(path.join(dir, name)).map((sub) => `${name}/${sub}`) : [name],
  );

const isLink = (p) => existsSync(p) && lstatSync(p).isSymbolicLink();
const storeIdOf = (realDir) => path.relative(store, realDir).split(path.sep)[0];

let cut = 0;
for (const id of readdirSync(store)) {
  const container = path.join(store, id, "node_modules");
  if (id === "node_modules" || !existsSync(container)) continue;
  for (const name of entries(container)) {
    const pkgJson = path.join(container, name, "package.json");
    if (isLink(path.join(container, name)) || !existsSync(pkgJson)) continue;
    const optionalPeers = JSON.parse(readFileSync(pkgJson, "utf8")).peerDependenciesMeta ?? {};
    const deps = JSON.parse(readFileSync(pkgJson, "utf8")).dependencies ?? {};
    for (const peer of Object.keys(optionalPeers)) {
      const link = path.join(container, peer);
      if (DEV_ONLY_PEERS.has(peer) && optionalPeers[peer]?.optional && !(peer in deps) && isLink(link)) {
        unlinkSync(link);
        cut++;
      }
    }
  }
}

const reached = new Set();
const queue = entries(path.join(out, "node_modules"))
  .filter((n) => n !== ".pnpm" && !n.startsWith(".") && n !== ".bin")
  .map((n) => path.join(out, "node_modules", n));
while (queue.length) {
  const real = realpathSync(queue.pop());
  if (!real.startsWith(store + path.sep)) continue;
  const id = storeIdOf(real);
  if (reached.has(id)) continue;
  reached.add(id);
  const container = path.join(store, id, "node_modules");
  for (const name of entries(container)) {
    const p = path.join(container, name);
    if (isLink(p) && existsSync(p)) queue.push(p);
  }
}

let removed = 0;
for (const id of readdirSync(store)) {
  if (id === "node_modules" || id.startsWith(".") || id.endsWith(".yaml") || reached.has(id)) continue;
  rmSync(path.join(store, id), { recursive: true, force: true });
  removed++;
}

// Drop now-dangling links (pnpm's hoisted .pnpm/node_modules and .bin entries).
let dangling = 0;
const sweep = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = lstatSync(p);
    if (stat.isSymbolicLink()) {
      if (!existsSync(p)) {
        unlinkSync(p);
        dangling++;
      }
    } else if (stat.isDirectory() && (name === "node_modules" || name === ".bin" || name.startsWith("@") || dir.endsWith("node_modules"))) {
      sweep(p);
    }
  }
};
sweep(path.join(store, "node_modules"));
sweep(path.join(out, "node_modules"));

console.log(`prune-dev-peers: cut ${cut} optional-peer links, removed ${removed} unreachable packages, ${dangling} dangling links`);
