import { Router } from "express";
import { generateObject } from "ai";
import { RetrievalInputSchema } from "@repo/schemas";
import { HydeSchema, HYDE_SYSTEM } from "@repo/rag/hyde";
import { isValidationWorker } from "../lib/internalValidationAuth.js";
import { getModelForTier, getProviderOptionsForTier } from "../llm/router.js";

const router: Router = Router();
router.post("/internal/research/hyde", async (req, res) => {
  if (!isValidationWorker(req)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  const parsed = RetrievalInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, message: "Invalid research input" });
    return;
  }
  try {
    const result = await generateObject({
      model: getModelForTier("free"),
      providerOptions: getProviderOptionsForTier("free"),
      schema: HydeSchema,
      system: HYDE_SYSTEM,
      prompt: JSON.stringify(parsed.data),
      maxRetries: 0,
      maxTokens: 6000,
      abortSignal: AbortSignal.timeout(110000),
    });
    res.json(result.object);
  } catch {
    res.status(502).json({ success: false, message: "HyDE generation failed" });
  }
});
export default router;
