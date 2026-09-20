const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
  "one", "our", "out", "day", "get", "has", "him", "his", "how", "man", "new",
  "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put",
  "say", "she", "too", "use", "with", "that", "this", "have", "from", "your",
  "will", "they", "what", "when", "make", "like", "time", "just", "know",
  "take", "into", "year", "your", "good", "some", "could", "them", "than",
  "then", "look", "only", "come", "over", "also", "back", "after", "work",
  "first", "well", "even", "want", "because", "these", "give", "most",
  "about", "which", "their", "would", "there", "other", "many", "such",
  "here", "very", "each", "much", "before", "through", "where", "should",
  "being", "those", "while", "again", "still", "every", "since", "under",
  "might", "same", "does", "off", "any", "own", "few", "why", "both", "more",
  "you're", "we're", "it's", "don't", "isn't", "was", "were", "been", "being",
  "does", "doing", "having", "having", "yours", "yourself", "himself",
  "herself", "itself", "themselves", "ourselves", "myself", "who's",
  "whom", "this", "these", "those", "am", "is", "are", "be", "been",
  "being", "do", "did", "doing", "a", "an", "as", "at", "by", "if", "in",
  "of", "on", "or", "so", "to", "up", "no", "nor", "yet", "once", "here",
  "there", "when", "where", "how", "all", "each", "few", "more", "most",
  "other", "some", "such", "than", "too", "very", "can", "will", "just",
  "should", "now",
])

export type KeywordDensityEntry = {
  keyword: string
  count: number
  density: number
}

export function computeKeywordDensity(
  pages: { bodyText: string }[]
): KeywordDensityEntry[] {
  const combined = pages.map((p) => p.bodyText).join(" ").toLowerCase()
  const tokens = combined.match(/\b[a-z0-9']+\b/g) ?? []

  const counts = new Map<string, number>()
  let totalCounted = 0

  for (const token of tokens) {
    if (token.length < 3) continue
    if (STOPWORDS.has(token)) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
    totalCounted += 1
  }

  const entries: KeywordDensityEntry[] = Array.from(counts.entries()).map(
    ([keyword, count]) => ({
      keyword,
      count,
      density: totalCounted > 0 ? Math.round((count / totalCounted) * 10000) / 100 : 0,
    })
  )

  entries.sort((a, b) => b.count - a.count)
  return entries.slice(0, 20)
}
