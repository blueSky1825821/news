export function readNewsHeadlines(value) {
  try {
    const titles = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(titles)
      ? titles.filter(title => typeof title === 'string' && title.trim())
      : [];
  } catch {
    return [];
  }
}

function outlineTitle(value) {
  return value.trim().replace(/[:：]$/u, '').trimEnd();
}

export function readNewsOutline(value, text) {
  const titles = readNewsHeadlines(value);
  const itemsByTitle = new Map();
  const sections = (text ?? '').split(/(?:^|[\n；：])\s*\d{1,2}[.．、](?!\d)\s*/u);
  for (const section of sections.slice(1)) {
    const [heading, ...items] = section.split(/(?:^|[\s；：:])\s*[（(]\d{1,2}[）)]\s*/u);
    if (!items.length) continue;

    const title = outlineTitle(heading);
    const subitems = items.map(item => item
      .replace(/\s*[（(]《新闻联播》[^\n]*$/u, '')
      .trim()
      .replace(/[；。]\s*$/u, ''))
      .filter(Boolean);
    itemsByTitle.set(title, subitems);
  }

  return titles.map(title => ({ title, subitems: itemsByTitle.get(outlineTitle(title)) ?? [] }));
}
