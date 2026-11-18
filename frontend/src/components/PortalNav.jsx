import React from 'react';

const portalCategories = [
  {
    title: '央媒门户',
    color: 'bg-red-50 border-red-200',
    titleColor: 'text-red-700',
    sites: [
      { name: '人民网', url: 'http://www.people.com.cn' },
      { name: '新华网', url: 'http://www.xinhuanet.com' },
      { name: '央视网', url: 'https://www.cctv.com' },
      { name: '中国网', url: 'http://www.china.com.cn' },
      { name: '中国日报', url: 'https://www.chinadaily.com.cn' },
      { name: '环球时报', url: 'https://www.huanqiu.com' },
    ]
  },
  {
    title: '商业门户',
    color: 'bg-blue-50 border-blue-200',
    titleColor: 'text-blue-700',
    sites: [
      { name: '新浪新闻', url: 'https://news.sina.com.cn' },
      { name: '网易新闻', url: 'https://news.163.com' },
      { name: '腾讯新闻', url: 'https://news.qq.com' },
      { name: '搜狐新闻', url: 'https://news.sohu.com' },
      { name: '凤凰新闻', url: 'https://news.ifeng.com' },
      { name: '今日头条', url: 'https://www.toutiao.com' },
    ]
  },
  {
    title: '财经门户',
    color: 'bg-green-50 border-green-200',
    titleColor: 'text-green-700',
    sites: [
      { name: '财新网', url: 'https://www.caixin.com' },
      { name: '第一财经', url: 'https://www.yicai.com' },
      { name: '21世纪经济报道', url: 'https://www.21jingji.com' },
      { name: '新浪财经', url: 'https://finance.sina.com.cn' },
      { name: '和讯网', url: 'https://www.hexun.com' },
      { name: '东方财富', url: 'https://www.eastmoney.com' },
    ]
  },
  {
    title: '科技门户',
    color: 'bg-purple-50 border-purple-200',
    titleColor: 'text-purple-700',
    sites: [
      { name: '36氪', url: 'https://36kr.com' },
      { name: '虎嗅网', url: 'https://www.huxiu.com' },
      { name: '钛媒体', url: 'https://www.tmtpost.com' },
      { name: '品玩', url: 'https://www.pingwest.com' },
      { name: '极客公园', url: 'https://www.geekpark.net' },
      { name: 'IT之家', url: 'https://www.ithome.com' },
    ]
  },
  {
    title: '地方新锐',
    color: 'bg-orange-50 border-orange-200',
    titleColor: 'text-orange-700',
    sites: [
      { name: '澎湃新闻', url: 'https://www.thepaper.cn' },
      { name: '界面新闻', url: 'https://www.jiemian.com' },
      { name: '新京报', url: 'https://www.bjnews.com.cn' },
      { name: '南方周末', url: 'https://www.infzm.com' },
      { name: '红星新闻', url: 'https://www.cdsb.com' },
      { name: '极目新闻', url: 'https://www.jimu.com' },
    ]
  },
  {
    title: '国际视野',
    color: 'bg-indigo-50 border-indigo-200',
    titleColor: 'text-indigo-700',
    sites: [
      { name: 'BBC 中文网', url: 'https://www.bbc.com/zhongwen' },
      { name: 'Reuters 中文网', url: 'https://www.reuters.com/world/china' },
      { name: 'FT 中文网', url: 'https://www.ftchinese.com' },
      { name: '联合早报', url: 'https://www.zaobao.com' },
      { name: '华尔街日报', url: 'https://cn.wsj.com' },
      { name: '纽约时报中文网', url: 'https://cn.nytimes.com' },
    ]
  }
];

export default function PortalNav() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">门户导航</h1>
        <p className="text-sm text-gray-500">
          汇总主流新闻门户网站，点击即可跳转阅读
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {portalCategories.map((category) => (
          <div
            key={category.title}
            className={`rounded-lg border p-5 ${category.color}`}
          >
            <h2 className={`mb-4 text-lg font-bold ${category.titleColor}`}>
              {category.title}
            </h2>
            <ul className="space-y-2">
              {category.sites.map((site) => (
                <li key={site.name}>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-blue-600"
                  >
                    <span>{site.name}</span>
                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
