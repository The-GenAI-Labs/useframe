import { z } from "zod";

export const MEDIA_PURPOSES = [
  "hero_visual",
  "hero_video",
  "section_video",
  "section_illustration",
  "feature_visual",
  "background",
  "cta_background",
  "gallery_item",
  "logo",
  "avatar",
  "team_photo",
  "product_screenshot",
  "customer_logo",
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

// Others are upload-only: a generated logo, team photo or screenshot would be a fake.
export const GENERATABLE_PURPOSES = [
  "hero_visual",
  "hero_video",
  "section_video",
  "section_illustration",
  "feature_visual",
  "background",
  "cta_background",
] as const satisfies readonly MediaPurpose[];

export const IMAGE_VARIANT_ROLES = ["w480", "w960", "w1600", "w2400", "fallback", "thumb"] as const;
export const VIDEO_VARIANT_ROLES = ["mp4_1080", "mp4_720", "poster", "poster_last", "thumb"] as const;
export const MEDIA_VARIANT_ROLES = [...new Set([...IMAGE_VARIANT_ROLES, ...VIDEO_VARIANT_ROLES])] as const;
export type MediaVariantRole = (typeof IMAGE_VARIANT_ROLES)[number] | (typeof VIDEO_VARIANT_ROLES)[number];

export function isMediaVariantRole(value: string): value is MediaVariantRole {
  return (MEDIA_VARIANT_ROLES as readonly string[]).includes(value);
}

export const UPLOAD_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const UPLOAD_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export type UploadMediaMime = (typeof UPLOAD_IMAGE_MIMES)[number] | (typeof UPLOAD_VIDEO_MIMES)[number];

const ISO_BMFF_VIDEO_BRANDS =
  /^(isom|iso[2-9a-z]|mp4[12v]|avc1|M4V |M4VP|mmp4|dash|f4v |qt  |3gp[0-9]|3g2[a-z]|MSNV|NDAS)$/;

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

function includesAscii(b: Uint8Array, needle: string): boolean {
  outer: for (let i = 0; i + needle.length <= b.length; i++) {
    for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

// The real type comes from the bytes; HEIC is named only so callers can explain the refusal.
export function sniffMediaBytes(head: Uint8Array): UploadMediaMime | "image/heic" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => head[i] === byte)) {
    return "image/png";
  }
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return includesAscii(head.subarray(0, 64), "webm") ? "video/webm" : null;
  }
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    const major = ascii(head, 8, 12);
    if (major === "avif" || major === "avis") return "image/avif";
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(major)) return "image/heic";
    if (major === "qt  ") return "video/quicktime";
    if (ISO_BMFF_VIDEO_BRANDS.test(major)) return "video/mp4";
  }
  return null;
}

// MP4 and QuickTime are one ISO-BMFF family (phones label either way); ffprobe re-checks.
export function sniffAgrees(declared: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  if (declared === sniffed) return true;
  const family = ["video/mp4", "video/quicktime"];
  return family.includes(declared) && family.includes(sniffed);
}

export const MediaVariantSchema = z.object({
  role: z.string().refine(isMediaVariantRole),
  key: z.string().min(1),
  mime: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type MediaVariant = z.infer<typeof MediaVariantSchema> & { role: MediaVariantRole };

export const MediaVariantsSchema = z.array(MediaVariantSchema);

export function parseMediaVariants(value: unknown): MediaVariant[] {
  const parsed = MediaVariantsSchema.safeParse(value);
  return parsed.success ? (parsed.data as MediaVariant[]) : [];
}

export const MediaBindingSchema = z.object({
  assetId: z.string().min(1).max(64),
  alt: z.string().max(200).optional(),
  loop: z.boolean().optional(),
  playWhen: z.enum(["load", "in_view"]).optional(),
  objectPosition: z
    .string()
    .max(40)
    .regex(/^[a-z0-9.% -]+$/i)
    .optional(),
  overlay: z.enum(["none", "light", "dark"]).optional(),
});
export type MediaBinding = z.infer<typeof MediaBindingSchema>;

export const MediaBindingsSchema = z.record(z.string().max(200), MediaBindingSchema);
export type MediaBindings = z.infer<typeof MediaBindingsSchema>;

export const MediaDescribeOutputSchema = z.object({
  description: z.string().max(300),
  altText: z.string().max(125),
  suggestedPurposes: z.array(z.enum(MEDIA_PURPOSES)).max(6),
  flagged: z.boolean(),
  flagReason: z.string().max(200).optional(),
});
export type MediaDescribeOutput = z.infer<typeof MediaDescribeOutputSchema>;

// Preview variants carry a signed `url`; export variants resolve to /media/... paths.
export type ResolvedMediaVariant = {
  role: MediaVariantRole;
  mime: string;
  width?: number;
  height?: number;
  bytes: number;
  sha256: string;
  url?: string;
};

export type ResolvedMediaAsset = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  origin: "UPLOADED" | "GENERATED";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  deleted: boolean;
  title: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  dominantColor: string | null;
  lqip: string | null;
  altText: string | null;
  decorative: boolean;
  variants: ResolvedMediaVariant[];
};

export type MediaMenuItem = {
  assetId: string;
  kind: "image" | "video";
  aspect: string | null;
  width: number | null;
  height: number | null;
  durationSec?: number;
  description: string | null;
  altText: string | null;
  suggestedPurposes: MediaPurpose[];
  origin: "uploaded" | "generated";
};
