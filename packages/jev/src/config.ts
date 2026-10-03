import { z } from "zod";
import type { JevFeature, JevMode } from "./types.js";
export const JevEnvSchema = z.object({
  JEV_MODE_CHAT_SCOPE: z.enum(["off", "shadow", "on"]).default("off"),
  TYPESAFE_API_KEY: z.string().default(""),
  JEV_MODEL: z.string().min(1).default("jev-1.13.0"),
  JEV_TIMEOUT_MS: z.coerce.number().int().min(50).max(10000).default(1000),
  JEV_MODE_RETRIEVAL_CACHE_VERIFY: z
    .enum(["off", "shadow", "on"])
    .default("off"),
});
export const jevConfig = () => JevEnvSchema.parse(process.env);
export function getJevMode(feature: JevFeature): JevMode {
  const mode = process.env[`JEV_MODE_${feature.toUpperCase()}`] ?? "off";
  return mode === "on" || mode === "shadow" ? mode : "off";
}
