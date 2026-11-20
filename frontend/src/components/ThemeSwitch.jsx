import { useEffect, useState } from 'react';

const THEME_KEY = 'news-theme';
const COLOR_SCHEME = '(prefers-color-scheme: dark)';

function readPreference() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export default function ThemeSwitch() {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(COLOR_SCHEME).matches);
  const dark = preference ? preference === 'dark' : systemDark;

  useEffect(() => {
    const scheme = window.matchMedia(COLOR_SCHEME);
    const onSchemeChange = event => setSystemDark(event.matches);
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) setPreference(readPreference());
    };

    scheme.addEventListener('change', onSchemeChange);
    window.addEventListener('storage', onStorage);
    return () => {
      scheme.removeEventListener('change', onSchemeChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#141619' : '#ffffff';
  }, [dark]);

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    setPreference(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the in-memory preference. */ }
  }

  return (
    <button type="button" className="news-theme-switch" aria-label="深色主题" aria-pressed={dark}
      onClick={toggleTheme}>
      <span aria-hidden="true">{dark ? '☾' : '☀'}</span>
      <span>{dark ? '深色' : '浅色'}</span>
    </button>
  );
}
