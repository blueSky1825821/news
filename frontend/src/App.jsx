import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useSpeech } from './hooks/useSpeech.js';
import { useTtsSettings } from './hooks/useTtsSettings.js';
import { useAuth } from './hooks/useAuth.js';
import NewsList from './components/NewsList.jsx';
import NewsDetail from './components/NewsDetail.jsx';
import SourceManager from './components/SourceManager.jsx';
import TtsSettings from './components/TtsSettings.jsx';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import WechatSettings from './components/WechatSettings.jsx';
import TodayNews from './components/TodayNews.jsx';
import AutoPlayBar from './components/AutoPlayBar.jsx';
import WechatLogin from './components/WechatLogin.jsx';
import PushNews from './components/PushNews.jsx';
import PortalNav from './components/PortalNav.jsx';
import EmailVerificationBanner from './components/EmailVerificationBanner.jsx';
import ForgotPassword from './components/ForgotPassword.jsx';
import ResetPassword from './components/ResetPassword.jsx';
import HotNews from './components/HotNews.jsx';
import CommentManager from './components/CommentManager.jsx';
import { api } from './services/api.js';

function Navbar({ user, isLoading, onLogout }) {
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
        {!isLoading && (
          <div className="news-account">
            {user ? (
              <>
                <span className="truncate">{user.displayName || user.email}</span>
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
      <div className="news-shell news-masthead">
        <Link to="/" className="news-wordmark">AI 新闻播报</Link>
      </div>
      <nav className="news-nav" aria-label="主导航">
        <div className="news-shell news-nav-links">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to="/today">今日推送</NavLink>
          <NavLink to="/portal">门户导航</NavLink>
          <NavLink to="/settings">设置</NavLink>
          {isAdmin && <NavLink to="/sources">来源管理</NavLink>}
          {isAdmin && <NavLink to="/wechat-settings">公众号后台</NavLink>}
        </div>
      </nav>
    </header>
  );
}

export default function App() {
  const { settings, setSettings } = useTtsSettings();
  const { user, isLoading, login, wechatLogin, register, logout, updateCategories } = useAuth();
  const navigate = useNavigate();
  const [massSendEnabled, setMassSendEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    setMassSendEnabled(false);
    if (!isLoading && user?.role === 'admin') {
      api.getWechatSettings().then((data) => { if (active) setMassSendEnabled(!!data.massSendEnabled); }).catch(() => {});
    }
    return () => { active = false; };
  }, [isLoading, user?.id, user?.role]);

  const {
    isSupported,
    isPlaying,
    currentIndex,
    total,
    voices,
    playQueue,
    playSingle,
    pause,
    resume,
    stop,
    next
  } = useSpeech({ rate: settings.rate, pitch: settings.pitch, voiceURI: settings.voiceURI });

  const [activeArticleId, setActiveArticleId] = useState(null);
  const playingArticlesRef = useRef([]);

  useEffect(() => {
    if (total > 0 && playingArticlesRef.current.length > 0) {
      const article = playingArticlesRef.current[currentIndex];
      if (article) {
        setActiveArticleId(article.id);
      }
    } else if (total === 0) {
      setActiveArticleId(null);
    }
  }, [currentIndex, total]);

  const handlePlaySingle = (article, text) => {
    playingArticlesRef.current = [article];
    setActiveArticleId(article.id);
    playSingle(text);
  };

  const handlePlayAll = (articles, texts) => {
    playingArticlesRef.current = articles;
    setActiveArticleId(articles[0]?.id || null);
    playQueue(texts);
  };

  const handleStop = () => {
    stop();
    setActiveArticleId(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen pb-20">
      <Navbar user={user} isLoading={isLoading} onLogout={handleLogout} />

      <EmailVerificationBanner user={user} />
      <main className="news-shell news-main">
        {!isSupported && <p className="mb-4 text-sm text-gray-500">当前浏览器不支持语音播报，可以正常阅读新闻。</p>}
        <Routes>
          <Route
            path="/"
            element={
              <NewsList
                user={user}
                isAdmin={!isLoading && user?.role === 'admin'}
                activeArticleId={activeArticleId}
                onPlaySingle={handlePlaySingle}
                onPlayAll={handlePlayAll}
              />
            }
          />
          <Route
            path="/article/:id"
            element={<NewsDetail user={user} onPlaySingle={playSingle} isAdmin={!isLoading && user?.role === 'admin'} massSendEnabled={massSendEnabled} />}
          />
          <Route path="/sources" element={isLoading ? <p>加载中...</p> : user?.role === 'admin' ? <SourceManager /> : <Navigate to={user ? '/' : '/login'} replace />} />
          <Route
            path="/settings"
            element={
              <TtsSettings
                settings={settings}
                onChange={setSettings}
                user={user}
                onUpdateCategories={updateCategories}
                voices={voices}
              />
            }
          />
          <Route path="/wechat-settings" element={isLoading ? <p>加载中...</p> : user?.role === 'admin' ? <WechatSettings /> : <Navigate to={user ? '/' : '/login'} replace />} />
          <Route path="/wechat-login" element={<WechatLogin onLogin={wechatLogin} />} />
          <Route path="/push/:id" element={<PushNews user={user} isLoading={isLoading} />} />
          <Route path="/today" element={<TodayNews activeArticleId={activeArticleId} onPlaySingle={handlePlaySingle} />} />
          <Route path="/portal" element={<PortalNav />} />
          <Route path="/hot" element={<HotNews />} />
          <Route path="/login" element={<LoginForm onLogin={login} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/comment-manager" element={isLoading ? <p>加载中...</p> : user?.role === 'admin' ? <CommentManager /> : <Navigate to={user ? '/' : '/login'} replace />} />
          <Route
            path="/register"
            element={<RegisterForm onRegister={register} />}
          />
        </Routes>
      </main>

      <AutoPlayBar
        currentIndex={currentIndex}
        total={total}
        isPlaying={isPlaying}
        onPause={pause}
        onResume={resume}
        onNext={next}
        onStop={handleStop}
      />
    </div>
  );
}
