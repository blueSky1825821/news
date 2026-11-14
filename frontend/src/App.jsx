import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
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
import { api } from './services/api.js';

function Navbar({ user, isLoading, onLogout }) {
  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900">AI 新闻播报</Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">首页</Link>
          {!isLoading && user?.role === 'admin' && <Link to="/sources" className="text-sm text-gray-600 hover:text-gray-900">来源管理</Link>}
          <Link to="/settings" className="text-sm text-gray-600 hover:text-gray-900">设置</Link>
          {!isLoading && user?.role === 'admin' && <Link to="/wechat-settings" className="text-sm text-gray-600 hover:text-gray-900">公众号后台</Link>}

          {!isLoading && (
            user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">{user.displayName || user.email}{user.role === 'admin' ? '（管理员）' : ''}</span>
                <button
                  onClick={onLogout}
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  退出登录
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  登录
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  注册
                </Link>
              </div>
            )
          )}
        </div>
      </div>
    </nav>
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
    <div className="min-h-screen bg-gray-50 pb-20">
      <Navbar user={user} isLoading={isLoading} onLogout={handleLogout} />

      <div className="mx-auto max-w-5xl px-4 py-6">
        {!isSupported && <p className="mb-4 text-sm text-gray-500">当前浏览器不支持语音播报，可以正常阅读新闻。</p>}
        <Routes>
          <Route
            path="/"
            element={
              <NewsList
                isAdmin={!isLoading && user?.role === 'admin'}
                activeArticleId={activeArticleId}
                onPlaySingle={handlePlaySingle}
                onPlayAll={handlePlayAll}
              />
            }
          />
          <Route
            path="/article/:id"
            element={<NewsDetail onPlaySingle={playSingle} isAdmin={!isLoading && user?.role === 'admin'} massSendEnabled={massSendEnabled} />}
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
          <Route path="/today" element={<TodayNews />} />
          <Route path="/login" element={<LoginForm onLogin={login} />} />
          <Route
            path="/register"
            element={<RegisterForm onRegister={register} />}
          />
        </Routes>
      </div>

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
