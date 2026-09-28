import "dotenv/config";
import { deleteExpiredScreenshots } from "@repo/validation/storage";
import { deleteExpiredPreviewPods } from "@repo/validation/localPreview";
await Promise.all([deleteExpiredScreenshots(), deleteExpiredPreviewPods()]);
console.log("Expired validation artifacts removed");
