import { runSchemaValidation } from "./scorers/schemaValidation.js"
import { checkCitationIntegrity } from "./scorers/citationIntegrity.js"
import { checkBriefCompliance } from "./scorers/briefCompliance.js"
import { runVariationCheck } from "./scorers/variationCheck.js"
import { pushToLangfuse } from "./report.js"
import type { SiteSpec, DesignBrief } from "@repo/schemas"

const COMPLIANT_TEST_SPEC: Partial<SiteSpec> = {
  designSystem: {
    primaryColor: "#2563EB",
    secondaryColor: "#F1F5F9",
    accentColor: "#F97316",
    fontPrimary: "Inter",
    fontSecondary: "DM Sans",
    spacing: "comfortable",
    borderRadius: "md",
    animationStyle: "subtle",
  },
  pages: [
    {
      type: "HOME",
      slug: "home",
      title: "Home",
      sections: [
        { type: "HERO", index: 0 },
        { type: "FOOTER", index: 1 },
      ],
    },
  ],
}

const DRIFTED_TEST_SPEC: Partial<SiteSpec> = {
  ...COMPLIANT_TEST_SPEC,
  designSystem: { ...COMPLIANT_TEST_SPEC.designSystem!, primaryColor: "#000000" },
}

const TEST_BRIEF: DesignBrief = {
  product: "Test product",
  audience: { primary: "adults" },
  goal: "Convert visitors",
  brand: { personality: "confident", positioning: "mid-range", tone: "direct" },
  colors: { primary: "#2563EB", secondary: "#F1F5F9", accent: "#F97316", rationale: "", citation: "" },
  typography: { primary: "Inter", secondary: "DM Sans", minSize: "16px", rationale: "", citation: "" },
  layout: { sections: ["HERO", "FOOTER"], rationale: "", citation: "" },
  copyFramework: "AIDA",
  frameworkRationale: "",
  density: "medium",
  motion: "subtle",
  accessibility: { minContrast: "4.5:1", touchTarget: "44px" },
  avoid: [],
  citations: [],
}

async function runTier1() {
  const schema = runSchemaValidation()
  const citations = await checkCitationIntegrity({ citations: [], pages: [] })

  const compliant = checkBriefCompliance(COMPLIANT_TEST_SPEC, TEST_BRIEF)
  const drifted = checkBriefCompliance(DRIFTED_TEST_SPEC, TEST_BRIEF)
  // briefCompliance "passes" as a scorer when it correctly identifies both
  // cases: compliant spec -> compliant:true, drifted spec -> compliant:false.
  const compliance = {
    pass: compliant.compliant && !drifted.compliant,
    compliant,
    drifted,
  }

  return { schema, citations, compliance }
}

async function main() {
  const tierArg = process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1]
  const tier = tierArg ?? process.env.EVAL_TIER ?? "1"

  const results: Record<string, { pass: boolean }> = {}

  console.log(`[evals] Running Tier 1 (deterministic)...`)
  const tier1 = await runTier1()
  results.schemaValidation = tier1.schema
  results.citationIntegrity = tier1.citations
  results.briefCompliance = tier1.compliance

  console.log("[evals] Tier 1 results:")
  console.log(`  schemaValidation: ${tier1.schema.pass ? "PASS" : "FAIL"} (${tier1.schema.failures.length} unexpected of ${tier1.schema.total})`)
  console.log(`  citationIntegrity: ${tier1.citations.pass ? "PASS" : "FAIL"}`)
  console.log(`  briefCompliance: ${tier1.compliance.pass ? "PASS" : "FAIL"}`)

  if (tier === "3" || tier === "all") {
    console.log("[evals] Running Tier 3 (variation check — requires a running orchestrator-service)...")
    const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? "http://localhost:4001"
    const variation = await runVariationCheck(orchestratorUrl)
    results.variationCheck = variation
    console.log(
      `  variationCheck: ${variation.pass ? "PASS" : "FAIL"} ` +
        `(colors=${variation.uniqueColors}, fonts=${variation.uniqueFonts}, layouts=${variation.uniqueLayouts}, sample=${variation.sampleSize})`
    )
    if (variation.errors.length > 0) {
      console.log(`  variationCheck errors: ${variation.errors.join("; ")}`)
    }
  }

  await pushToLangfuse(results)

  const failed = Object.values(results).some((r) => !r.pass)
  if (failed) {
    console.error("[evals] One or more evals failed.")
    process.exit(1)
  }
  console.log("[evals] All evals passed.")
}

main().catch((err) => {
  console.error("[evals] Fatal error:", err)
  process.exit(1)
})
