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

function articlePlayback(article, mode, onMissingFull) {
  if (mode !== 'full') return { title: article.title, summary: article.summary, mode };

  const fullItem = (details) => {
    const content = details.transcript || details.content;
    if (!content?.trim()) {
      onMissingFull(details.title);
      return { title: details.title, summary: details.summary, mode: 'summary' };
    }
    return { title: details.title, content, mode };
  };
  if ((article.transcript || article.content)?.trim()) return fullItem(article);
  return {
    async load(signal) {
      const details = await api.getArticle(article.id, { signal });
      if (signal.aborted) return;
      return fullItem(details);
    }
  };
}

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
    playbackError,
    isLoadingArticle,
    playQueue,
    playSingle,
    pause,
    resume,
    stop,
    next
  } = useSpeech(settings);

  const [activeArticleId, setActiveArticleId] = useState(null);
  const [playMode, setPlayMode] = useState('');
  const [playbackNotice, setPlaybackNotice] = useState('');
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

  const handlePlayAll = (articles, mode) => {
    if (!isSupported || !articles.length) return;
    setPlayMode(mode);
    setPlaybackNotice('');
    playingArticlesRef.current = articles;
    setActiveArticleId(articles[0]?.id || null);
    playQueue(articles.map(article => articlePlayback(article, mode, (title) => {
      setPlaybackNotice(`《${title}》暂无可播报的全文，已改为播报标题和可用摘要。`);
    })));
  };

  const handlePlaySingle = (article, mode = settings.defaultMode) => handlePlayAll([article], mode);

  const handlePlayText = (item) => {
    setPlayMode('');
    setPlaybackNotice('');
    playingArticlesRef.current = [];
    setActiveArticleId(null);
    playSingle(item);
  };

  const handleStop = () => {
    stop();
    setPlaybackNotice('');
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
        {playbackError && <p className="mb-4 text-sm text-red-700" role="alert">{playbackError}</p>}
        <AppRoutes user={user} isLoading={isLoading} massSendEnabled={massSendEnabled}
          activeArticleId={activeArticleId} onPlaySingle={handlePlaySingle} onPlayAll={handlePlayAll}
          onPlayText={handlePlayText} settings={settings} onChangeSettings={setSettings} voices={voices}
          onUpdateCategories={updateCategories} onUpdateProfile={updateProfile} onChangePassword={changePassword}
          onLogin={login} onWechatLogin={wechatLogin} onVerify={refreshUser} onRegister={register} />
      </main>

      <AutoPlayBar
        currentIndex={currentIndex}
        total={total}
        isPlaying={isPlaying}
        isLoadingArticle={isLoadingArticle}
        mode={playMode}
        notice={playbackNotice}
        onChangeMode={(mode) => handlePlayAll(playingArticlesRef.current.slice(currentIndex), mode)}
        onPause={pause}
        onResume={resume}
        onNext={next}
        onStop={handleStop}
      />
    </div>
  );
}
