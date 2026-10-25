import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'news-tts-settings';

export const DEFAULT_TTS_SETTINGS = {
  rate: 1.05,
  pitch: 1.0,
  defaultMode: 'summary', // 'summary' | 'full'
  voiceURI: '' // 空字符串表示使用浏览器默认语音
};

export function useTtsSettings() {
  const [settings, setSettingsState] = useState(DEFAULT_TTS_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettingsState({
          ...DEFAULT_TTS_SETTINGS,
          ...parsed
        });
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  const setSettings = useCallback((updates) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save TTS settings:', err);
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_TTS_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to reset TTS settings:', err);
    }
  }, []);

  return {
    settings,
    loaded,
    setSettings,
    resetSettings
  };
}
