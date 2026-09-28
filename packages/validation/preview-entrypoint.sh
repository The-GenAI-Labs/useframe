#!/bin/sh
set -eu
mkdir /tmp/site
if [ -f /input/files.json ]; then
  node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; for (const f of JSON.parse(fs.readFileSync("/input/files.json", "utf8"))) { if (f.path.includes("\\") || f.path.includes(":") || f.path.split("/").some(p => !p || p === "." || p === ".." || p.startsWith(".env")) || f.path.startsWith("node_modules/")) throw new Error("Unsafe file path"); const dest = path.join("/tmp/site", f.path); fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest,f.content); }'
else
  cp -R /input/. /tmp/site/
fi
ln -s "/opt/$1/node_modules" /tmp/site/node_modules
cd /tmp/site
export HOME=/tmp NEXT_TELEMETRY_DISABLED=1
if [ "$1" = next ]; then
  exec node node_modules/next/dist/bin/next dev --hostname 0.0.0.0 --port 3000
fi
exec node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000 --strictPort