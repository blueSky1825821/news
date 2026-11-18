import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

const portalCategories = [
  {
    title: '央媒门户',
    color: 'bg-red-50 border-red-200',
    titleColor: 'text-red-700',
    icon: '🏛️',
    sites: [
      { name: '人民网', url: 'http://www.people.com.cn', desc: '中国共产党中央委员会机关报网站' },
      { name: '新华网', url: 'http://www.xinhuanet.com', desc: '新华社官方网站' },
      { name: '央视网', url: 'https://www.cctv.com', desc: '中国中央电视台官方网站' },
      { name: '中国网', url: 'http://www.china.com.cn', desc: '国务院新闻办公室领导' },
      { name: '中国日报', url: 'https://www.chinadaily.com.cn', desc: '国家级英文日报' },
      { name: '环球时报', url: 'https://www.huanqiu.com', desc: '人民日报社主办' },
    ]
  },
  {
    title: '商业门户',
    color: 'bg-blue-50 border-blue-200',
    titleColor: 'text-blue-700',
    icon: '📰',
    sites: [
      { name: '新浪新闻', url: 'https://news.sina.com.cn', desc: '新浪旗下新闻平台' },
      { name: '网易新闻', url: 'https://news.163.com', desc: '网易旗下新闻平台' },
      { name: '腾讯新闻', url: 'https://news.qq.com', desc: '腾讯旗下新闻平台' },
      { name: '搜狐新闻', url: 'https://news.sohu.com', desc: '搜狐旗下新闻平台' },
      { name: '凤凰新闻', url: 'https://news.ifeng.com', desc: '凤凰卫视旗下' },
      { name: '今日头条', url: 'https://www.toutiao.com', desc: '字节跳动旗下资讯平台' },
    ]
  },
  {
    title: '财经门户',
    color: 'bg-green-50 border-green-200',
    titleColor: 'text-green-700',
    icon: '💹',
    sites: [
      { name: '财新网', url: 'https://www.caixin.com', desc: '财新传媒旗下' },
      { name: '第一财经', url: 'https://www.yicai.com', desc: '上海文广集团财经媒体' },
      { name: '21世纪经济报道', url: 'https://www.21jingji.com', desc: '南方财经全媒体集团' },
      { name: '新浪财经', url: 'https://finance.sina.com.cn', desc: '新浪财经频道' },
      { name: '和讯网', url: 'https://www.hexun.com', desc: '老牌财经门户' },
      { name: '东方财富', url: 'https://www.eastmoney.com', desc: '股票基金数据平台' },
    ]
  },
  {
    title: '科技门户',
    color: 'bg-purple-50 border-purple-200',
    titleColor: 'text-purple-700',
    icon: '💻',
    sites: [
      { name: '36氪', url: 'https://36kr.com', desc: '科技创业资讯平台' },
      { name: '虎嗅网', url: 'https://www.huxiu.com', desc: '科技创新与商业资讯' },
      { name: '钛媒体', url: 'https://www.tmtpost.com', desc: 'TMT行业资讯平台' },
      { name: '品玩', url: 'https://www.pingwest.com', desc: '科技创新内容平台' },
      { name: '极客公园', url: 'https://www.geekpark.net', desc: '科技创业者社区' },
      { name: 'IT之家', url: 'https://www.ithome.com', desc: 'IT资讯与数码产品' },
    ]
  },
  {
    title: '地方新锐',
    color: 'bg-orange-50 border-orange-200',
    titleColor: 'text-orange-700',
    icon: '📍',
    sites: [
      { name: '澎湃新闻', url: 'https://www.thepaper.cn', desc: '上海东方早报旗下' },
      { name: '界面新闻', url: 'https://www.jiemian.com', desc: '上海报业集团出品' },
      { name: '新京报', url: 'https://www.bjnews.com.cn', desc: '北京市委宣传部主管' },
      { name: '南方周末', url: 'https://www.infzm.com', desc: '南方报业传媒集团' },
      { name: '红星新闻', url: 'https://www.cdsb.com', desc: '成都商报旗下' },
      { name: '极目新闻', url: 'https://www.jimu.com', desc: '楚天都市报旗下' },
    ]
  },
  {
    title: '国际视野',
    color: 'bg-indigo-50 border-indigo-200',
    titleColor: 'text-indigo-700',
    icon: '🌍',
    sites: [
      { name: 'BBC 中文网', url: 'https://www.bbc.com/zhongwen', desc: '英国广播公司中文' },
      { name: 'Reuters 中文网', url: 'https://www.reuters.com/world/china', desc: '路透社中国报道' },
      { name: 'FT 中文网', url: 'https://www.ftchinese.com', desc: '金融时报中文版' },
      { name: '联合早报', url: 'https://www.zaobao.com', desc: '新加坡主流媒体' },
      { name: '华尔街日报', url: 'https://cn.wsj.com', desc: 'WSJ 中文版' },
      { name: '纽约时报中文网', url: 'https://cn.nytimes.com', desc: 'NYT 中文版' },
    ]
  }
];

export default function PortalNav() {
  const [query, setQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return portalCategories;
    const q = query.trim().toLowerCase();
    return portalCategories
      .map((cat) => ({
        ...cat,
        sites: cat.sites.filter(
          (s) => s.name.toLowerCase().includes(q) || (s.desc && s.desc.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.sites.length > 0);
  }, [query]);

  const totalSites = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.sites.length, 0),
    [filteredCategories]
  );

  const openAllInCategory = (sites) => {
    sites.forEach((site) => window.open(site.url, '_blank', 'noopener,noreferrer'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">门户导航</h1>
        <p className="text-sm text-gray-500">
          汇总主流新闻门户网站，点击即可跳转阅读
        </p>
      </div>

      {/* Xinwenlianbo Quick Entry */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📺</span>
            <div>
              <h2 className="text-lg font-bold text-red-800">新闻联播</h2>
              <p className="text-sm text-red-600">每日 19:00 自动抓取 CCTV 新闻联播音频并 AI 摘要</p>
            </div>
          </div>
          <Link
            to="/"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            onClick={() => {
              // Let user know they can filter on homepage
              sessionStorage.setItem('filterCategory', 'xinwenlianbo');
            }}
          >
            查看摘要
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索门户网站..."
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <svg
          className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600"
          >
            清空
          </button>
        )}
      </div>

      {/* Stats */}
      {query && (
        <p className="text-sm text-gray-500">
          搜索 "{query}" 找到 {totalSites} 个结果
        </p>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCategories.map((category) => (
          <div
            key={category.title}
            className={`rounded-lg border p-5 ${category.color}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-lg font-bold ${category.titleColor}`}>
                <span className="mr-1">{category.icon}</span>
                {category.title}
              </h2>
              <button
                onClick={() => openAllInCategory(category.sites)}
                className="rounded bg-white/80 px-2 py-1 text-xs text-gray-600 hover:bg-white"
                title="一键打开全部分类"
              >
                全部打开
              </button>
            </div>
            <ul className="space-y-2">
              {category.sites.map((site) => (
                <li key={site.name}>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between rounded-md bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-700 group-hover:text-blue-600">
                        {site.name}
                      </div>
                      {site.desc && (
                        <div className="mt-0.5 truncate text-xs text-gray-400">
                          {site.desc}
                        </div>
                      )}
                    </div>
                    <svg
                      className="ml-2 mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          未找到匹配的门户网站
        </div>
      )}
    </div>
  );
}
