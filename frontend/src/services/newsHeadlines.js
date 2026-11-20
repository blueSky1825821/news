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
