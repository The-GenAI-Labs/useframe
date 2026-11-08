import { Router } from "express";
import { generateObject } from "ai";
import {
  LABEL_SYSTEM,
  LabelRequestSchema,
  LabelResponseSchema,
} from "@repo/rag/labels";
import { isValidationWorker } from "../lib/internalValidationAuth.js";
import { getCheapModel } from "../llm/router.js";

const router: Router = Router();
router.post("/internal/research/labels", async (req, res) => {
  if (!isValidationWorker(req)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  const parsed = LabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, message: "Invalid label request" });
    return;
  }
  try {
    const result = await generateObject({
      model: getCheapModel(),
      schema: LabelResponseSchema,
      mode: "json",
      system: LABEL_SYSTEM,
      prompt: JSON.stringify(parsed.data),
      maxRetries: 0,
      maxTokens: 8000,
      abortSignal: AbortSignal.timeout(55000),
    });
    res.json(result.object);
  } catch {
    res
      .status(502)
      .json({ success: false, message: "Label generation failed" });
  }
});
export default router;
