export const moreNewsUrl = 'http://q7banlife.me/news/';
export const moreNewsText = `查看更多：${moreNewsUrl}`;

export function formatHeadlineLines(articles) {
  const headlines = articles.map(article => article.title?.trim()).filter(Boolean);
  return headlines.map((title, index) => headlines.length > 1 ? `${index + 1}. ${title}` : title);
}
