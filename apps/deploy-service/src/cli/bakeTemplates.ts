// Docker build step: node_modules templates for the compiler's fixed dependency sets.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dependencyHash } from "@/pipeline/detect.js";
import { INSTALL_ARGS } from "@/pipeline/build.js";
import { templatePackageJsons } from "@/pipeline/templates.js";

const root = process.argv[2] ?? "/opt/templates";

for (const { name, packageJson } of templatePackageJsons()) {
  const hash = dependencyHash(JSON.parse(packageJson));
  const dir = path.join(root, hash);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), packageJson);
  execFileSync("npm", INSTALL_ARGS.filter((a) => a !== "--prefer-offline"), { cwd: dir, stdio: "inherit" });
  console.log(`baked ${name} -> ${dir}`);
}
