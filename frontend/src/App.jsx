import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { useSpeech } from './hooks/useSpeech.js';
import { useTtsSettings } from './hooks/useTtsSettings.js';
import { useAuth } from './hooks/useAuth.js';
import AppRoutes from './AppRoutes.jsx';
import Navbar from './components/Navbar.jsx';
import AutoPlayBar from './components/AutoPlayBar.jsx';
import EmailVerificationBanner from './components/EmailVerificationBanner.jsx';
import { api } from './services/api.js';

export default function App() {
  const { settings, setSettings } = useTtsSettings();
  const { user, isLoading, login, wechatLogin, register, logout, refreshUser, updateCategories, updateProfile, changePassword } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== previousPath.current && navigationType !== 'POP') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousPath.current = pathname;
  }, [pathname, navigationType]);
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
      <a className="news-skip-link" href="#main-content">跳到正文</a>
      <Navbar user={user} isLoading={isLoading} onLogout={handleLogout} />

      <EmailVerificationBanner key={user?.id} user={user} />
      <main id="main-content" className="news-shell news-main" tabIndex={-1}>
        {!isSupported && <p className="mb-4 text-sm text-gray-500">当前浏览器不支持语音播报，可以正常阅读新闻。</p>}
        <AppRoutes user={user} isLoading={isLoading} massSendEnabled={massSendEnabled}
          activeArticleId={activeArticleId} onPlaySingle={handlePlaySingle} onPlayAll={handlePlayAll}
          onPlayText={playSingle} settings={settings} onChangeSettings={setSettings} voices={voices}
          onUpdateCategories={updateCategories} onUpdateProfile={updateProfile} onChangePassword={changePassword}
          onLogin={login} onWechatLogin={wechatLogin} onVerify={refreshUser} onRegister={register} />
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
