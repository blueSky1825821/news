/**
 * Normalize a string for fuzzy comparison:
 * - lower case
 * - remove punctuation, whitespace, numbers
 * - trim
 */
export function normalizeForCompare(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 */
export function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Return similarity ratio between 0 and 1.
 * 1 means identical, 0 means completely different.
 */
export function similarityRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * Check if two titles are considered duplicates.
 */
export function isDuplicateTitle(titleA, titleB, threshold = 0.85) {
  const a = normalizeForCompare(titleA);
  const b = normalizeForCompare(titleB);
  if (!a || !b) return false;
  if (a === b) return true;
  return similarityRatio(a, b) >= threshold;
}
