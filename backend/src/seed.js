import { getDb } from './db.js';

const defaultSources = [
  ['人民日报-时政', 'http://www.people.com.cn/rss/politics.xml', 'politics'],
  ['人民日报-社会', 'http://www.people.com.cn/rss/society.xml', 'society'],
  ['人民日报-国际', 'http://www.people.com.cn/rss/world.xml', 'world'],
  ['新浪新闻-要闻', 'https://rss.sina.com.cn/news/china/focus15.xml', 'general'],
  ['CCTV新闻联播', 'https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8', 'xinwenlianbo', 'xinwenlianbo', 0]
];

const additionalRssSources = [
  ['中国新闻网-国际', 'https://www.chinanews.com.cn/rss/world.xml', 'general'],
  ['中国新闻网-财经', 'https://www.chinanews.com.cn/rss/finance.xml', 'business'],
  ['IT之家', 'https://www.ithome.com/rss/', 'tech'],
  ['少数派', 'https://sspai.com/feed', 'tech'],
  ['爱范儿', 'https://www.ifanr.com/feed', 'tech']
];

const popularRssSources = [
  ['中国新闻网-时政', 'https://www.chinanews.com.cn/rss/china.xml', 'politics'],
  ['中国新闻网-社会', 'https://www.chinanews.com.cn/rss/society.xml', 'general'],
  ['中国新闻网-体育', 'https://www.chinanews.com.cn/rss/sports.xml', 'sports'],
  ['中国新闻网-滚动新闻', 'https://www.chinanews.com.cn/rss/scroll-news.xml', 'general'],
  ['香港电台-本地新闻', 'https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml', 'general'],
  ['公视新闻', 'https://news.pts.org.tw/xml/newsfeed.xml', 'general'],
  ['BBC 中文', 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', 'general'],
  ['纽约时报中文网', 'https://cn.nytimes.com/rss/', 'general'],
  ['法国国际广播电台-中文', 'https://www.rfi.fr/cn/rss', 'general'],
  ['德国之声-中文', 'https://rss.dw.com/rdf/rss-chi-all', 'general']
];

function seedSourceBatch(key, sources) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    // Apply each batch once so health-based deactivations and deletions survive restarts.
    const { changes } = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, '1')
      ON CONFLICT(key) DO NOTHING
    `).run(key);

    if (changes > 0) {
      const insert = db.prepare(`
        INSERT INTO sources (name, rssUrl, category, type, fetchIntervalMinutes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(rssUrl) DO NOTHING
      `);
      for (const [name, rssUrl, category, type = 'rss', interval = 30] of sources) {
        insert.run(name, rssUrl, category, type, interval);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function seedSources() {
  seedSourceBatch('seed.defaultSources.v1', defaultSources);
  seedSourceBatch('seed.additionalRssSources.v1', additionalRssSources);
  seedSourceBatch('seed.additionalRssSources.v2', popularRssSources);
}
