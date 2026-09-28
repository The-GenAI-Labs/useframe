import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { runTier0Checks } from "@repo/validation";

const server = createServer((req, res) => {
  if (req.url === "/broken.png") {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    req.url === "/bad"
      ? '<html><body><div style="width:200vw">overflow</div><img src="/broken.png"><script>throw new Error("intentional regression fixture")</script></body></html>'
      : "<html><body><main><h1>Healthy rendered page</h1></main></body></html>",
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const base = `http://127.0.0.1:${address.port}`;
  const healthy = await runTier0Checks(base, page);
  assert.equal(healthy.passed, true, JSON.stringify(healthy.issues));
  const broken = await runTier0Checks(`${base}/bad`, page);
  assert.equal(broken.passed, false);
  for (const check of ["broken_asset", "page_error", "layout_overflow"])
    assert(
      broken.issues.some((issue) => issue.check === check),
      `Missing ${check}`,
    );
  const healthyAgain = await runTier0Checks(base, page);
  assert.equal(
    healthyAgain.passed,
    true,
    "Event handlers leaked errors between assessments",
  );
  console.log(
    "Tier 0 real-browser smoke passed: healthy page, missing image, JS error, overflow, listener cleanup",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
