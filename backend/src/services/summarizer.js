/**
 * Extract a plain-text summary from HTML content.
 * Used as a fallback when RSS only provides full content or no summary.
 */
export function extractSummary(content, maxLength = 300) {
  if (!content || typeof content !== 'string') return '';

  // Strip HTML tags
  const plain = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return '';

  // Try to take the first 1-3 sentences, capped by maxLength
  const sentences = plain.match(/[^。！？.!?]+[。！？.!?]+/g) || [plain];
  let summary = '';
  for (const sentence of sentences.slice(0, 3)) {
    if ((summary + sentence).length > maxLength) break;
    summary += sentence;
  }

  // Fallback to truncate if no sentences were captured
  if (!summary) {
    summary = plain.length > maxLength ? plain.slice(0, maxLength) + '…' : plain;
  }

  return summary.trim();
}

export function stripHtmlForSpeech(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
