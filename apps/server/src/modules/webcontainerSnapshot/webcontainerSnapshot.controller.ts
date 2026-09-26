import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { access } from "node:fs/promises";
import { env } from "@/config/env.js";
import { AppError } from "@/middleware/errorHandler.js";
import { SnapshotTemplateParamSchema } from "./webcontainerSnapshot.schema.js";

export const WebcontainerSnapshotController = {
  get: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = SnapshotTemplateParamSchema.safeParse(req.params);
      if (!parsed.success) {
        throw new AppError("Unknown snapshot template", 404);
      }

      if (!env.WEBCONTAINER_SNAPSHOTS_DIR) {
        throw new AppError("Snapshots are not configured on this server", 404);
      }

      const filePath = path.resolve(
        env.WEBCONTAINER_SNAPSHOTS_DIR,
        parsed.data.template === "base-nextjs"
          ? "base-nextjs-v2.snapshot"
          : "base-vite.snapshot",
      );

      try {
        await access(filePath);
      } catch {
        throw new AppError("Snapshot has not been built yet", 404);
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) next(err);
      });
    } catch (err) {
      next(err);
    }
  },
};
