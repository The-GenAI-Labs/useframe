// pnpm --filter @repo/site-builder gallery
// Builds every fixture with buildSite, runs a real `vite build` (what
// deploy-service does) and captures screenshots into docs/site-builder-gallery.
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { buildSite } from "../src/index.js";
import { fixtures, PHOTO_SPECS } from "./fixtures.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../docs/site-builder-gallery");
const WIDTHS = [375, 768, 1440];
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

function serve(root: string, spa: boolean): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      let file = path.join(root, pathname);
      if (!file.startsWith(root)) return res.writeHead(403).end();
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
      } catch {
        if (!spa) return res.writeHead(404).end();
        file = path.join(root, "index.html");
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
    });
  });
}

async function renderPhotos(browser: Browser, dir: string): Promise<void> {
  const page = await browser.newPage();
  for (const p of PHOTO_SPECS) {
    await page.setViewportSize({ width: Math.round(p.width / 2), height: Math.round(p.height / 2) });
    const [h1, h2] = p.hues;
    await page.setContent(`<body style="margin:0;height:100vh;background:
      radial-gradient(60% 80% at 25% 30%, hsl(${h1} 70% 62%), transparent 70%),
      radial-gradient(50% 70% at 80% 70%, hsl(${h2} 65% 40%), transparent 72%),
      linear-gradient(135deg, hsl(${h1} 45% 22%), hsl(${h2} 50% 12%))"></body>`);
    await page.screenshot({ path: path.join(dir, `${p.id}.png`) });
  }
  await page.close();
}

// The workspace pins esbuild 0.27, which Vite 5 cannot down-level react-router
// with, hence --target. A child process keeps Vite's esbuild apart from the one tsx already loaded;
// the work dir sits in this package so the generated vite.config.js resolves
// vite, the React plugin and React from here.
function viteBuild(root: string): string {
  const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  const result = spawnSync(process.execPath, [vite, "build", "--logLevel", "warn", "--target", "esnext"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("vite build failed in " + root);
  return path.join(root, "dist");
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const work = path.resolve(here, "../.gallery-tmp");
  await rm(work, { recursive: true, force: true });
  const browser = await chromium.launch();
  const problems: string[] = [];
  try {
    const assetsDir = path.join(work, "assets");
    await mkdir(assetsDir, { recursive: true });
    await renderPhotos(browser, assetsDir);
    const assetServer = await serve(assetsDir, false);
    try {
      for (const fx of fixtures(assetServer.url)) {
        const root = path.join(work, fx.name);
        const built = buildSite(fx.spec, undefined, { media: { target: "preview", assets: fx.assets } });
        for (const w of built.mediaWarnings) problems.push(`${fx.name}: media warning ${w}`);
        for (const file of built.files) {
          const full = path.join(root, file.path);
          await mkdir(path.dirname(full), { recursive: true });
          await writeFile(full, file.content);
        }
        const multiPage = built.files.some((f) => f.path.startsWith("src/pages/"));
        const dist = viteBuild(root);
        const site = await serve(dist, true);
        try {
          const routes = multiPage ? fx.spec.pages.map((p) => (p.type === "HOME" ? "/" : `/${p.slug}`)) : ["/"];
          for (const route of routes) {
            for (const width of WIDTHS) {
              const page = await browser.newPage({ viewport: { width, height: 900 } });
              page.on("console", (m) => {
                if (m.type() === "error") problems.push(`${fx.name}${route}@${width}: console ${m.text()}`);
              });
              page.on("pageerror", (e) => problems.push(`${fx.name}${route}@${width}: ${e.message}`));
              await page.goto(site.url + route, { waitUntil: "networkidle" });
              await page.evaluate(() => document.fonts.ready);
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
              if (overflow > 1) problems.push(`${fx.name}${route}@${width}: horizontal overflow ${overflow}px`);
              const h1s = await page.locator("h1").count();
              if (h1s !== 1) problems.push(`${fx.name}${route}@${width}: ${h1s} h1 elements`);
              const suffix = route === "/" ? "" : `-${route.slice(1)}`;
              await page.screenshot({ path: path.join(outDir, `${fx.name}${suffix}-${width}.png`), fullPage: true });
              await page.close();
            }
          }
          console.log(`✓ ${fx.name}`);
        } finally {
          site.server.close();
        }
      }
    } finally {
      assetServer.server.close();
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
  console.log(`Screenshots: ${outDir}`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  }
}

await main();
