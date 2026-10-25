import { CATEGORY_NAMES } from '../constants/categories.js';

const KEYWORD_RULES = {
  tech: [
    '人工智能', 'ai', '芯片', '半导体', '手机', '苹果', '谷歌', '微软', '特斯拉',
    '电动车', '新能源', '5g', '云计算', '大数据', '区块链', '比特币', '互联网',
    '软件', '硬件', '无人机', '机器人', '科技', '数码', 'technology', 'tech',
    'smartphone', 'iphone', 'android', 'nvidia', 'google', 'microsoft', 'apple',
    'tesla', 'electric vehicle', 'crypto', 'bitcoin', 'cloud', 'software'
  ],
  business: [
    '股市', '股票', '基金', '投资', '融资', 'ipo', '上市', '财报', '营收', '利润',
    '经济', '金融', '银行', '保险', '房地产', '楼市', '油价', '汇率', '关税',
    '贸易', '公司', '企业', '并购', '收购', 'stock', 'market', 'finance',
    'investment', 'economy', 'trade', 'tariff', 'bank', 'insurance', 'real estate',
    'ipo', 'earnings', 'revenue', 'profit', 'company', 'corporation'
  ],
  science: [
    'nasa', 'spacex', '火星', '月球', '航天', '卫星', '量子', '基因', '病毒',
    '疫苗', '气候', '变暖', '能源', '物理', '化学', '生物', '科学', '研究',
    '实验室', '发现', 'space', 'mars', 'moon', 'rocket', 'satellite', 'quantum',
    'gene', 'virus', 'vaccine', 'climate', 'energy', 'physics', 'chemistry',
    'biology', 'science', 'research', 'study'
  ],
  politics: [
    '政府', '总统', '国会', '议会', '选举', '投票', '政策', '法律', '法案',
    '外交', '军事', '战争', '冲突', '制裁', '谈判', '联合国', '中国', '美国',
    '俄罗斯', '欧盟', 'government', 'president', 'congress', 'parliament',
    'election', 'vote', 'policy', 'law', 'bill', 'diplomacy', 'military', 'war',
    'conflict', 'sanction', 'united nations', 'china', 'america', 'russia', 'eu'
  ],
  sports: [
    '足球', '篮球', 'nba', '世界杯', '奥运会', '网球', 'f1', '赛车', '高尔夫',
    '游泳', '田径', '冠军', '决赛', '联赛', '球员', '教练', '体育', 'football',
    'soccer', 'basketball', 'nba', 'world cup', 'olympics', 'tennis', 'formula 1',
    'racing', 'golf', 'swimming', 'athletics', 'champion', 'final', 'league',
    'player', 'coach', 'sport'
  ],
  entertainment: [
    '电影', '电视剧', '综艺', '明星', '演员', '歌手', '音乐节', '演唱会', '奥斯卡',
    '戛纳', '好莱坞', '票房', '绯闻', '恋情', '离婚', '结婚', '娱乐', '八卦',
    'movie', 'film', 'tv series', 'show', 'celebrity', 'actor', 'actress',
    'singer', 'music festival', 'concert', 'oscar', 'cannes', 'hollywood',
    'box office', 'entertainment'
  ]
};

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(text, keyword) {
  const lowerKeyword = keyword.toLowerCase();
  // Chinese keywords: substring match
  if (/[一-龥]/.test(lowerKeyword)) {
    return text.includes(lowerKeyword);
  }
  // Short English keywords (<=3 chars): require word boundaries
  if (lowerKeyword.length <= 3) {
    const regex = new RegExp(`(^|[^a-z])${escapeRegex(lowerKeyword)}([^a-z]|$)`, 'i');
    return regex.test(text);
  }
  // Longer English keywords: substring match
  return text.includes(lowerKeyword);
}

export function classifyArticle(title = '', summary = '', sourceCategory = '') {
  const text = `${title} ${summary}`.toLowerCase();
  const matched = [];

  for (const [category, keywords] of Object.entries(KEYWORD_RULES)) {
    if (keywords.some((k) => keywordMatches(text, k))) {
      matched.push(category);
    }
  }

  if (matched.length > 0) {
    return matched;
  }

  const fallback = CATEGORY_NAMES.includes(sourceCategory) ? sourceCategory : 'general';
  return [fallback];
}
