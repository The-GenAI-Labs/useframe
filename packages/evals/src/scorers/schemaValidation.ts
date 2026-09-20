import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { SiteSpecSchema } from "@repo/schemas"

const __dirname = dirname(fileURLToPath(import.meta.url))

type StructuralCase = { name: string; expectValid: boolean; spec: unknown }

export type SchemaValidationResult = {
  pass: boolean
  total: number
  failures: { name: string; expected: boolean; actual: boolean; errors?: string }[]
}

export function runSchemaValidation(): SchemaValidationResult {
  const cases: StructuralCase[] = JSON.parse(
    readFileSync(join(__dirname, "../../datasets/spec-structural-cases.json"), "utf-8")
  )

  const failures: SchemaValidationResult["failures"] = []

  for (const c of cases) {
    const result = SiteSpecSchema.safeParse(c.spec)
    const actual = result.success
    if (actual !== c.expectValid) {
      failures.push({
        name: c.name,
        expected: c.expectValid,
        actual,
        errors: result.success ? undefined : JSON.stringify(result.error.flatten()),
      })
    }
  }

  return { pass: failures.length === 0, total: cases.length, failures }
}
