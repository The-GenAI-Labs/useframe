import { createServer, type Server } from "node:http";

export function startHealthServer(port: number, isHealthy: () => boolean): Server {
  return createServer((_req, res) => {
    const ok = isHealthy();
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: ok ? "ok" : "unavailable", service: "deploy-worker" }));
  }).listen(port);
}
