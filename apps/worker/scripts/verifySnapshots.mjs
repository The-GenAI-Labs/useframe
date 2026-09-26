import { createServer } from "vite";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

const workerDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const webDir = path.resolve(workerDir, "../web");
const fixtureFiles = process.argv[2]
  ? JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8"))
  : null;
const apiModule = `/@fs/${path.join(webDir, "node_modules/@webcontainer/api/dist/index.js").replace(/\\/g, "/")}`;
const server = await createServer({
  configFile: false,
  root: webDir,
  plugins: [
    {
      name: "snapshot-check",
      configureServer(vite) {
        vite.middlewares.use(handleRequest);
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
async function handleRequest(req, res, next) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.url === "/__snapshot_check") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><body><script type="module" src="/snapshot-entry.js"></script></body></html>',
    );
    return;
  }
  if (req.url === "/snapshot-entry.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(
      `import { WebContainer } from ${JSON.stringify(apiModule)}; window.bootContainer = () => WebContainer.boot();`,
    );
    return;
  }
  const match = req.url?.match(/^\/snapshot\/(base-nextjs|base-vite)$/);
  if (!match) return next();
  try {
    res.setHeader("Content-Type", "application/octet-stream");
    res.end(
      await readFile(
        path.join(workerDir, "snapshots", `${match[1]}-v2.snapshot`),
      ),
    );
  } catch (error) {
    next(error);
  }
}

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("Smoke-test server did not bind a TCP port");
  browser = await chromium.launch({ headless: true });
  for (const name of ["base-nextjs"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (message) => console.log(`[${name}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(error));
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error(response.status(), response.url());
    });
    await page.goto(`http://127.0.0.1:${address.port}/__snapshot_check`);
    await page.waitForFunction(
      () => typeof window.bootContainer === "function",
      { timeout: 30_000 },
    );
    const result = await Promise.race([
      page.evaluate(
        async ({ template, files }) => {
          if (!crossOriginIsolated)
            throw new Error("Smoke-test page is not cross-origin isolated");
          const wc = await window.bootContainer();
          let proc;
          let log = "";
          try {
            const response = await fetch(`/snapshot/${template}`);
            if (!response.ok)
              throw new Error(`Snapshot HTTP ${response.status}`);
            await wc.mount(await response.arrayBuffer());
            if (files) {
              for (const file of files) {
                const parent = file.path.split("/").slice(0, -1).join("/");
                if (parent) await wc.fs.mkdir(parent, { recursive: true });
                await wc.fs.writeFile(file.path, file.content);
              }
            }
            const binary = template === "base-nextjs" ? "next" : "vite";
            const contents = await wc.fs.readFile(
              `node_modules/.bin/${binary}`,
              "utf-8",
            );
            if (!contents.startsWith("#!/usr/bin/env node"))
              throw new Error(`Missing Node launcher: ${binary}`);
            const check = await wc.spawn("node", [
              `node_modules/.bin/${binary}`,
              "--version",
            ]);
            const checkOutput = check.output.pipeTo(
              new WritableStream({
                write(chunk) {
                  log += chunk;
                },
              }),
            );
            const checkExit = await check.exit;
            await checkOutput;
            if (checkExit !== 0) throw new Error(`Binary check failed: ${log}`);
            console.log(log);
            const ready = new Promise((resolve) =>
              wc.on("server-ready", (_port, url) => resolve(url)),
            );
            proc = await wc.spawn("npm", ["run", "dev"]);
            void proc.output.pipeTo(
              new WritableStream({
                write(chunk) {
                  log = (log + chunk).slice(-12000);
                  console.log(chunk);
                },
              }),
            );
            const url = await Promise.race([
              ready,
              proc.exit.then((code) => {
                throw new Error(`Dev exited ${code}: ${log}`);
              }),
            ]);
            const iframe = document.createElement("iframe");
            iframe.src = url;
            document.body.append(iframe);
            return { url, log };
          } catch (error) {
            proc?.kill();
            wc.teardown();
            throw error;
          }
        },
        { template: name, files: fixtureFiles },
      ),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${name}: WebContainer smoke test timed out`)),
          240_000,
        );
        timer.unref();
      }),
    ]);
    const frame = page.frameLocator("iframe").last();
    await frame
      .locator("body")
      .filter({ hasText: /\S/ })
      .waitFor({ timeout: 90_000 });
    const body = await frame.locator("body").innerText();
    if (
      fixtureFiles
        ? /Build Error|Module not found|Runtime Error|Application error/.test(
            body,
          )
        : !body.includes("Loading preview")
    )
      throw new Error(
        `${name}: unexpected preview body: ${body.slice(0, 1000)}`,
      );
    console.log(
      `${name}: mounted launcher, npm run dev, server-ready and iframe verified`,
      result.url,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
