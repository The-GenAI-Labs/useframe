import { z } from "zod";

// Shared with apps/site-edge and Stage 2; keep in sync with apps/site-edge/src/resolve.ts.
export const SiteKvValueSchema = z.discriminatedUnion("t", [
  z
    .object({
      v: z.literal(1),
      t: z.literal("p"),
      k: z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/),
      m: z.enum(["n", "s"]),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      t: z.literal("r"),
      u: z.string().regex(/^https:\/\/[a-z0-9.-]+$/, "u must be https://host with no trailing slash"),
    })
    .strict(),
  z.object({ v: z.literal(1), t: z.literal("x") }).strict(),
]);

export type SiteKvValue = z.infer<typeof SiteKvValueSchema>;

export class KvContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KvContractError";
  }
}

export function kvKeyForHost(host: string): string {
  if (host !== host.toLowerCase() || !/^[a-z0-9.-]+$/.test(host)) {
    throw new KvContractError(`Host must be a lowercase hostname: ${host}`);
  }
  return `h:${host}`;
}

export function serializeValue(value: SiteKvValue): string {
  const parsed = SiteKvValueSchema.safeParse(value);
  if (!parsed.success) {
    throw new KvContractError(`Invalid KV value: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const json = JSON.stringify(parsed.data);
  if (json.length >= 200) throw new KvContractError("KV value must stay under 200 bytes");
  return json;
}
