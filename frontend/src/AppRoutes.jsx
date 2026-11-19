import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import NewsList from './components/NewsList.jsx';

const NewsDetail = lazy(() => import('./components/NewsDetail.jsx'));
const SourceManager = lazy(() => import('./components/SourceManager.jsx'));
const SettingsPage = lazy(() => import('./components/SettingsPage.jsx'));
const LoginForm = lazy(() => import('./components/LoginForm.jsx'));
const RegisterForm = lazy(() => import('./components/RegisterForm.jsx'));
const WechatSettings = lazy(() => import('./components/WechatSettings.jsx'));
const TodayNews = lazy(() => import('./components/TodayNews.jsx'));
const WechatLogin = lazy(() => import('./components/WechatLogin.jsx'));
const PushNews = lazy(() => import('./components/PushNews.jsx'));
const PortalNav = lazy(() => import('./components/PortalNav.jsx'));
const ForgotPassword = lazy(() => import('./components/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./components/ResetPassword.jsx'));
const Trends = lazy(() => import('./components/Trends.jsx'));
const HotNews = lazy(() => import('./components/HotNews.jsx'));
const CommentManager = lazy(() => import('./components/CommentManager.jsx'));
const VerifyEmail = lazy(() => import('./components/VerifyEmail.jsx'));

function PageLoading() {
  return <p className="news-message" role="status">正在加载页面…</p>;
}

function AdminRoute({ isLoading, user, children }) {
  if (isLoading) return <PageLoading />;
  if (user?.role === 'admin') return children;
  return <Navigate to={user ? '/' : '/login'} replace />;
}

export default function AppRoutes({
  user, isLoading, massSendEnabled, activeArticleId, onPlaySingle, onPlayAll, onPlayText,
  settings, onChangeSettings, voices, onUpdateCategories, onUpdateProfile, onChangePassword,
  onLogin, onWechatLogin, onVerify, onRegister
}) {
  const isAdmin = !isLoading && user?.role === 'admin';
  const permissions = { isLoading, user };

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={
          <NewsList user={user} isAdmin={isAdmin} activeArticleId={activeArticleId}
            onPlaySingle={onPlaySingle} onPlayAll={onPlayAll} />
        } />
        <Route path="/article/:id" element={
          <NewsDetail user={user} onPlaySingle={onPlayText} isAdmin={isAdmin} massSendEnabled={massSendEnabled} />
        } />
        <Route path="/settings" element={
          <SettingsPage settings={settings} onChange={onChangeSettings} user={user}
            onUpdateCategories={onUpdateCategories} onUpdateProfile={onUpdateProfile}
            onChangePassword={onChangePassword} voices={voices} />
        } />
        <Route path="/sources" element={<AdminRoute {...permissions}><SourceManager /></AdminRoute>} />
        <Route path="/wechat-settings" element={<AdminRoute {...permissions}><WechatSettings /></AdminRoute>} />
        <Route path="/comment-manager" element={<AdminRoute {...permissions}><CommentManager /></AdminRoute>} />
        <Route path="/wechat-login" element={<WechatLogin onLogin={onWechatLogin} />} />
        <Route path="/push/:id" element={<PushNews user={user} isLoading={isLoading} />} />
        <Route path="/today" element={<TodayNews user={user} activeArticleId={activeArticleId} onPlaySingle={onPlaySingle} />} />
        <Route path="/portal" element={<PortalNav />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/hot" element={<HotNews />} />
        <Route path="/login" element={<LoginForm onLogin={onLogin} />} />
        <Route path="/verify-email" element={<VerifyEmail onVerified={onVerify} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/register" element={<RegisterForm onRegister={onRegister} />} />
      </Routes>
    </Suspense>
  );
}
