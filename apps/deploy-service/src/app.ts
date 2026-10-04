import express, { type Express } from "express";
import helmet from "helmet";
import type { Deps } from "@/deps.js";
import { errorHandler, internalRouter } from "@/routes/internal.routes.js";

export function createApp(deps: Deps, internalSecret: string): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));

  const health = (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok", service: "deploy", timestamp: new Date().toISOString() });
  };
  app.get("/health", health);
  app.get("/healthz", health);

  app.use("/internal", internalRouter(deps, internalSecret));
  app.use("/{*splat}", (_req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
