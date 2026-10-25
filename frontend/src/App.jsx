import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
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

function Navbar({ user, isLoading, onLogout }) {
  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900">AI 新闻播报</Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">首页</Link>
          <Link to="/sources" className="text-sm text-gray-600 hover:text-gray-900">来源管理</Link>
          <Link to="/settings" className="text-sm text-gray-600 hover:text-gray-900">设置</Link>
          <Link to="/wechat-settings" className="text-sm text-gray-600 hover:text-gray-900">公众号</Link>

          {!isLoading && (
            user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">{user.email}</span>
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
  const { user, isLoading, login, register, logout, updateCategories } = useAuth();
  const navigate = useNavigate();

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

  if (!isSupported) {
    return (
      <div className="p-8 text-center text-gray-600">
        您的浏览器不支持语音播报功能。
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Navbar user={user} isLoading={isLoading} onLogout={handleLogout} />

      <div className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={
              <NewsList
                activeArticleId={activeArticleId}
                onPlaySingle={handlePlaySingle}
                onPlayAll={handlePlayAll}
              />
            }
          />
          <Route
            path="/article/:id"
            element={<NewsDetail onPlaySingle={playSingle} />}
          />
          <Route path="/sources" element={<SourceManager />} />
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
          <Route path="/wechat-settings" element={<WechatSettings />} />
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
