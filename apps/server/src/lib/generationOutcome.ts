import { prisma } from "@useframe/db"

type UserEdit = {
  field: string
  from: unknown
  to: unknown
  instruction: string
  at: string
}

// Looked up by projectId, not versionId: a GenerationOutcome row is created
// once, at Research-brief approval, against that first version — but the
// user's edits keep landing on newer versions created by each /iterate call
// (a new ProjectVersion per edit). projectId is the stable key that still
// finds the right row no matter which version number the edit produced.
export async function recordUserEdit(
  projectId: string,
  field: string,
  from: unknown,
  to: unknown,
  instruction: string
): Promise<void> {
  const outcome = await prisma.generationOutcome.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  })
  if (!outcome) return

  const edits = (Array.isArray(outcome.userEdits) ? outcome.userEdits : []) as UserEdit[]
  edits.push({ field, from, to, instruction, at: new Date().toISOString() })

  await prisma.generationOutcome.update({
    where: { id: outcome.id },
    data: { userEdits: edits as never },
  })
}
