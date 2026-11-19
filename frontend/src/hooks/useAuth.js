import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api.js';

const TOKEN_KEY = 'news-auth-token';
const USER_KEY = 'news-auth-user';

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // ignore
  }
}

export function useAuth() {
  const [user, setUser] = useState(() => getStoredToken() ? getStoredUser() : null);
  const [token, setToken] = useState(getStoredToken);
  const [isLoading, setIsLoading] = useState(true);
  const session = useRef({ token, user });
  const refreshSequence = useRef(0);

  const saveSession = useCallback((nextToken, nextUser) => {
    session.current = { token: nextToken, user: nextUser };
    setToken(nextToken);
    setUser(nextUser);
    setStoredToken(nextToken);
    setStoredUser(nextUser);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => saveSession(null, null), [saveSession]);

  const refreshUser = useCallback(async () => {
    const current = session.current;
    const sequence = ++refreshSequence.current;
    const isCurrent = () => session.current === current && refreshSequence.current === sequence;
    if (!current.token) {
      setIsLoading(false);
      return;
    }

    try {
      const { user: refreshed } = await api.getMe();
      if (isCurrent()) saveSession(current.token, refreshed);
    } catch (err) {
      if (!isCurrent()) return;
      if (err.status === 401 || err.status === 404) logout();
      throw err;
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [logout, saveSession]);

  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    const recheckVerification = () => {
      if (document.visibilityState === 'visible' && session.current.user && !session.current.user.emailVerified) {
        refreshUser().catch(() => {});
      }
    };
    const syncVerification = event => {
      const current = session.current;
      if (event.key !== USER_KEY || !current.user || current.user.emailVerified) return;
      const stored = getStoredUser();
      if (stored?.id === current.user.id && stored.emailVerified && getStoredToken() === current.token) {
        refreshUser().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', recheckVerification);
    window.addEventListener('storage', syncVerification);
    return () => {
      document.removeEventListener('visibilitychange', recheckVerification);
      window.removeEventListener('storage', syncVerification);
    };
  }, [refreshUser]);

  const handleAuthResponse = useCallback(({ user, token }) => {
    saveSession(token, user);
    return user;
  }, [saveSession]);

  const login = useCallback(async ({ email, password, adminLogin }) => {
    const data = await api.login({ email, password, adminLogin });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const register = useCallback(async ({ email, password, categories }) => {
    const data = await api.register({ email, password, categories });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const wechatLogin = useCallback(async (ticket) => {
    const data = await api.exchangeWechatTicket(ticket);
    handleAuthResponse(data);
    return data.returnTo;
  }, [handleAuthResponse]);

  const updateCategories = useCallback(async (categories) => {
    const { token: activeToken } = session.current;
    const data = await api.setUserCategories(categories);
    if (session.current.token === activeToken) {
      saveSession(activeToken, { ...session.current.user, categories: data.categories });
    }
    return data.categories;
  }, [saveSession]);

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    await api.changePassword(oldPassword, newPassword);
  }, []);

  const updateProfile = useCallback(async (profile) => {
    const { token: activeToken } = session.current;
    const data = await api.updateProfile(profile);
    if (session.current.token === activeToken) {
      saveSession(activeToken, { ...session.current.user, ...data.user });
    }
    return data.user;
  }, [saveSession]);

  return {
    user,
    token,
    isLoading,
    isLoggedIn: !!user,
    login,
    wechatLogin,
    register,
    logout,
    refreshUser,
    updateCategories,
    changePassword,
    updateProfile
  };
}
