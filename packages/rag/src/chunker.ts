export type FindingTextChunk = {
  chunkIndex: number;
  chunkText: string;
  wordCount: number;
};

export function chunkStatement(statement: string): FindingTextChunk[] {
  const words = [...statement.matchAll(/\S+/gu)];
  if (!words.length) return [];
  if (words.length <= 200)
    return [{ chunkIndex: 0, chunkText: statement, wordCount: words.length }];
  const boundaries: number[] = [];
  let wordIndex = 0;
  for (const sentence of new Intl.Segmenter("en", {
    granularity: "sentence",
  }).segment(statement)) {
    const end = sentence.index + sentence.segment.length;
    while (wordIndex < words.length && words[wordIndex]!.index! < end)
      wordIndex++;
    if (wordIndex > (boundaries.at(-1) ?? 0)) boundaries.push(wordIndex);
  }
  const spans: Array<[number, number]> = [];
  let start = 0;
  let cursor = 0;
  let lastEnd = 0;
  while (cursor < words.length) {
    const next = boundaries.find((b) => b > cursor) ?? words.length;
    const sentenceStart = boundaries[boundaries.indexOf(next) - 1] ?? 0;
    const end = next - sentenceStart > 180 ? Math.min(next, start + 150) : next;
    cursor = end;
    if (cursor - start < 150 && cursor < words.length) continue;
    if (cursor === words.length && spans.length && cursor - lastEnd < 40) {
      spans[spans.length - 1]![1] = cursor;
      break;
    }
    spans.push([start, cursor]);
    lastEnd = cursor;
    if (cursor === words.length) break;
    const sentenceStarts = [0, ...boundaries].filter(
      (b) => b >= start && b < cursor,
    );
    start = sentenceStarts.find((b) => cursor - b <= 30) ?? cursor - 25;
  }
  return spans.map(([from, to], chunkIndex) => ({
    chunkIndex,
    chunkText: statement.slice(
      from === 0 ? 0 : words[from]!.index!,
      to === words.length
        ? statement.length
        : words[to - 1]!.index! + words[to - 1]![0].length,
    ),
    wordCount: to - from,
  }));
}
