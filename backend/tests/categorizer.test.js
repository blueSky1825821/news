import { classifyArticle } from '../src/services/categorizer.js';

describe('Categorizer', () => {
  it('matches keywords in title', () => {
    const result = classifyArticle('Apple releases new iPhone', '', '');
    expect(result).toContain('tech');
  });

  it('matches keywords in summary', () => {
    const result = classifyArticle('Market update', 'Stock prices rose today as investors bought shares.', '');
    expect(result).toContain('business');
  });

  it('returns multiple categories when multiple keywords match', () => {
    const result = classifyArticle('Tech companies invest in stock market', '', '');
    expect(result).toContain('tech');
    expect(result).toContain('business');
  });

  it('falls back to source category when no keywords match', () => {
    const result = classifyArticle('Random article', 'Nothing specific here.', 'science');
    expect(result).toEqual(['science']);
  });

  it('falls back to general when source category is unknown', () => {
    const result = classifyArticle('Random article', 'Nothing specific here.', 'unknown-category');
    expect(result).toEqual(['general']);
  });

  it('does not match short keywords inside other words', () => {
    const result = classifyArticle('First news article title', '', '');
    expect(result).not.toContain('tech');
  });

  it('matches Chinese keywords', () => {
    const result = classifyArticle('中国科技公司发布新款手机', '', '');
    expect(result).toContain('tech');
  });
});
