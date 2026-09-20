import "dotenv/config"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { embedMany } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "../src/index.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedDataDir = join(__dirname, "seedData")

type DomainPatternSeed = {
  domain: string
  typicalSections: string[]
  toneRange: string[]
  conversionPattern: string
  commonObjections: string[]
  proofTypes: string[]
}

type AudienceModifierSeed = {
  audience: string
  modifies: Record<string, unknown>
}

type ResearchFindingSeed = {
  claim: string
  paper: string
  field: string
  appliesTo: string[]
  audience: string[]
  decision: string
  options: unknown
  contextHeader: string
  verified: boolean
}

type FindingRelationSeed = {
  from: string
  to: string
  relation: string
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(seedDataDir, filename), "utf-8")) as T
}

async function seedDomainPatterns() {
  const rows = loadJson<DomainPatternSeed[]>("domainPatterns.json")
  for (const row of rows) {
    await prisma.domainPattern.upsert({
      where: { domain: row.domain },
      create: row,
      update: row,
    })
  }
  console.log(`[seed] Upserted ${rows.length} domain patterns`)
}

async function seedAudienceModifiers() {
  const rows = loadJson<AudienceModifierSeed[]>("audienceModifiers.json")
  for (const row of rows) {
    await prisma.audienceModifier.upsert({
      where: { audience: row.audience },
      create: { audience: row.audience, modifies: row.modifies as never },
      update: { modifies: row.modifies as never },
    })
  }
  console.log(`[seed] Upserted ${rows.length} audience modifiers`)
}

async function seedResearchFindings() {
  const rows = loadJson<ResearchFindingSeed[]>("researchFindings.json")

  const openaiApiKey = process.env.OPENAI_API_KEY
  const shouldEmbed = !!openaiApiKey

  if (!shouldEmbed) {
    console.warn(
      "[seed] OPENAI_API_KEY not set — findings will be seeded WITHOUT embeddings. " +
        "Dense retrieval will return no results until you re-run seed with a key set.",
    )
  }

  const embeddingModel = shouldEmbed
    ? createOpenAI({ apiKey: openaiApiKey }).textEmbeddingModel("text-embedding-3-small")
    : null

  const BATCH_SIZE = 100
  let embeddings: number[][] = []

  if (embeddingModel) {
    const inputs = rows.map((r) => `${r.contextHeader}\n${r.claim}`)
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE)
      const { embeddings: batchEmbeddings } = await embedMany({
        model: embeddingModel,
        values: batch,
      })
      embeddings.push(...batchEmbeddings)
      console.log(`[seed] Embedded ${Math.min(i + BATCH_SIZE, inputs.length)}/${inputs.length} findings`)
    }
  }

  let upserted = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const existing = await prisma.researchFinding.findFirst({
      where: { claim: row.claim, paper: row.paper },
      select: { id: true },
    })

    const data = {
      claim: row.claim,
      paper: row.paper,
      field: row.field,
      appliesTo: row.appliesTo,
      audience: row.audience,
      decision: row.decision,
      options: row.options as never,
      contextHeader: row.contextHeader,
      verified: row.verified,
    }

    const id = existing
      ? existing.id
      : (await prisma.researchFinding.create({ data })).id

    if (existing) {
      await prisma.researchFinding.update({ where: { id }, data })
    }

    if (embeddings[i]) {
      const vectorLiteral = `[${embeddings[i]!.join(",")}]`
      await prisma.$executeRawUnsafe(
        `UPDATE research_findings SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        id,
      )
    }

    upserted++
  }
  console.log(`[seed] Upserted ${upserted} research findings`)

  return rows
}

async function seedFindingRelations(findings: ResearchFindingSeed[]) {
  let relations: FindingRelationSeed[] = []
  try {
    relations = loadJson<FindingRelationSeed[]>("findingRelations.json")
  } catch {
    console.log("[seed] No findingRelations.json — skipping relations")
    return
  }

  const claimToId = new Map<string, string>()
  for (const f of findings) {
    const row = await prisma.researchFinding.findFirst({
      where: { claim: f.claim, paper: f.paper },
      select: { id: true },
    })
    if (row) claimToId.set(f.claim, row.id)
  }

  let created = 0
  for (const rel of relations) {
    const fromId = claimToId.get(rel.from)
    const toId = claimToId.get(rel.to)
    if (!fromId || !toId) continue
    await prisma.findingRelation.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: { fromId, toId, relation: rel.relation },
      update: { relation: rel.relation },
    })
    created++
  }
  console.log(`[seed] Upserted ${created} finding relations`)
}

async function main() {
  await seedDomainPatterns()
  await seedAudienceModifiers()
  const findings = await seedResearchFindings()
  await seedFindingRelations(findings)
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
