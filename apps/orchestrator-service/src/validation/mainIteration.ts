import { SiteSpecSchema } from "@repo/schemas";
import { UnsupportedValidationCorrection } from "@repo/validation";
import { runIteration } from "../agents/iterate.agent.js";
export async function iterateMainValidation(
  projectId: string,
  version: { id: string; snapshot: unknown; siteType: string },
  instruction: string,
) {
  const currentSpec = SiteSpecSchema.parse({
    ...(version.snapshot as object),
    siteType: version.siteType,
  });
  const result = await runIteration({
    projectId,
    versionId: version.id,
    currentSpec,
    instruction,
  });
  const updatedSpec = SiteSpecSchema.parse(result.updatedSpec);
  if (
    !result.changed ||
    JSON.stringify(updatedSpec) === JSON.stringify(currentSpec)
  )
    throw new UnsupportedValidationCorrection(
      "No supported content correction is available for the remaining issues",
    );
  return updatedSpec;
}
