import { Link, NavLink } from 'react-router-dom';
import logo from '../../../wenxu.png';
import ThemeSwitch from './ThemeSwitch.jsx';

export default function Navbar({ user, isLoading, onLogout }) {
  const isAdmin = !isLoading && user?.role === 'admin';
  const editionDate = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  return (
    <header className="news-header">
      <div className="news-shell news-utility">
        <time>{editionDate}</time>
        <div className="news-utility-actions">
          <ThemeSwitch />
          {!isLoading && (
            <div className="news-account">
              {user ? (
                <>
                  <span className="truncate">{user.displayName || user.email?.split('@')[0] || user.email}</span>
                  <button className="shrink-0" onClick={onLogout}>退出登录</button>
                </>
              ) : (
                <>
                  <Link to="/login">登录</Link>
                  <Link to="/register">注册</Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="news-shell news-masthead">
        <Link to="/" className="news-wordmark">
          <img src={logo} alt="闻序首页" width="1254" height="1254" />
        </Link>
        <span className="news-masthead-description">新闻阅读与播报</span>
      </div>
      <nav className="news-nav" aria-label="主导航">
        <div className="news-shell news-nav-links">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to="/trends">一键热搜</NavLink>
          <NavLink to="/hot">热门榜</NavLink>
          <NavLink to="/today">最近收录</NavLink>
          <NavLink to="/portal">门户导航</NavLink>
          <NavLink to="/settings">设置</NavLink>
          {isAdmin && <NavLink to="/comment-manager">评论管理</NavLink>}
          {isAdmin && <NavLink to="/sources">来源管理</NavLink>}
          {isAdmin && <NavLink to="/wechat-settings">公众号后台</NavLink>}
        </div>
      </nav>
    </header>
  );
}
