const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const PHONE = /\+?\d[\d\s().-]{7,}\d/
const STYLE_OF = /\bin the style of\b/i
const UNSAFE = /\b(gore|blood|bloody|corpse|weapon|gun|knife|nude|naked|sexual|erotic|nsfw|violent|violence|kill|suicide|drugs?)\b/i

// Checks our own generated prompts before they leave for an image or video provider.
export function lintPrompt(prompt: string, forbiddenTerms: readonly string[] = []): string[] {
  const issues: string[] = []
  if (EMAIL.test(prompt)) issues.push("contains an email address")
  if (PHONE.test(prompt)) issues.push("contains a phone number")
  if (STYLE_OF.test(prompt)) issues.push('uses "in the style of"')
  const unsafe = UNSAFE.exec(prompt)
  if (unsafe) issues.push(`contains the unsafe term "${unsafe[0]}"`)
  const lower = prompt.toLowerCase()
  for (const term of forbiddenTerms) {
    if (term.trim().length >= 3 && lower.includes(term.toLowerCase())) issues.push(`names "${term}"`)
  }
  return issues
}
