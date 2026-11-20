export function normalizeHeadlines(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Map();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const title = value.trim()
      .replace(/^(?:(?:[-*•]|\d+[、.．)）]|[一二三四五六七八九十]+、)\s*)+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[。；;]+$/, '')
      .trim();
    const key = title.replace(/[\p{P}\s]/gu, '').toLowerCase();
    if (key && !unique.has(key)) unique.set(key, title);
    if (unique.size === 20) break;
  }
  return [...unique.values()];
}

export function extractOpeningHeadlines(transcript) {
  const opening = transcript.slice(0, 2400).match(
    /(?:主要内容(?:有|是)?|内容提要)[：:。\s]*([\s\S]*?)(?:下面请听详细内容|下面请看详细报道|下面请看详细内容|以下是详细内容|请看详细报道)/
  );
  if (!opening) return [];
  return normalizeHeadlines(opening[1].split(/[。；;\n]+/));
}
