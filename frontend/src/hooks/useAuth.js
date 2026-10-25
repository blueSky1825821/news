import { useState, useEffect, useCallback } from 'react';
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
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(getStoredToken);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    setToken(storedToken);
    try {
      const data = await api.getMe();
      setUser(data.user);
      setStoredUser(data.user);
    } catch (err) {
      console.error('Failed to load user:', err);
      logout();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user && token) {
      loadUser();
    } else {
      setIsLoading(false);
    }
  }, [user, token, loadUser]);

  const handleAuthResponse = useCallback((data) => {
    const { user, token } = data;
    setUser(user);
    setToken(token);
    setStoredToken(token);
    setStoredUser(user);
    return user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await api.login({ email, password });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const register = useCallback(async ({ email, password, categories }) => {
    const data = await api.register({ email, password, categories });
    return handleAuthResponse(data);
  }, [handleAuthResponse]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setStoredToken(null);
    setStoredUser(null);
  }, []);

  const updateCategories = useCallback(async (categories) => {
    const data = await api.setUserCategories(categories);
    const updated = { ...user, categories: data.categories };
    setUser(updated);
    setStoredUser(updated);
    return data.categories;
  }, [user]);

  return {
    user,
    token,
    isLoading,
    isLoggedIn: !!user,
    login,
    register,
    logout,
    updateCategories
  };
}
