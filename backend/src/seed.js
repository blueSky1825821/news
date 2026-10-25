import { insertSource } from './models/source.js';

const defaultSources = [
  { name: '人民日报-时政', rssUrl: 'http://www.people.com.cn/rss/politics.xml', category: 'politics', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '人民日报-社会', rssUrl: 'http://www.people.com.cn/rss/society.xml', category: 'society', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '人民日报-国际', rssUrl: 'http://www.people.com.cn/rss/world.xml', category: 'world', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '新浪新闻-要闻', rssUrl: 'http://rss.sina.com.cn/news/index.shtml', category: 'general', isActive: 1, fetchIntervalMinutes: 30 }
];

export function seedSources() {
  for (const source of defaultSources) {
    try {
      insertSource({ ...source, fetchIntervalMinutes: 30 });
    } catch (err) {
      console.error('Seed error:', err.message);
    }
  }
}
