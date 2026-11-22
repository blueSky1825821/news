import { useState, useEffect, useCallback } from 'react';

import { NEWS_RATE } from '../services/speech.js';

const STORAGE_KEY = 'news-tts-settings';

export const DEFAULT_TTS_SETTINGS = {
  rate: NEWS_RATE,
  pitch: 1.0,
  defaultMode: 'summary', // 'summary' | 'full'
  voiceURI: '',
  englishVoiceURI: ''
};

export function useTtsSettings() {
  const [settings, setSettingsState] = useState(DEFAULT_TTS_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const triggeredAt = new Date().toISOString();
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
      console.error(`[triggeredAt=${triggeredAt}]`, 'Failed to load TTS settings:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  const setSettings = useCallback((updates) => {
    const triggeredAt = new Date().toISOString();
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.error(`[triggeredAt=${triggeredAt}]`, 'Failed to save TTS settings:', err);
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const triggeredAt = new Date().toISOString();
    setSettingsState(DEFAULT_TTS_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error(`[triggeredAt=${triggeredAt}]`, 'Failed to reset TTS settings:', err);
    }
  }, []);

  return {
    settings,
    loaded,
    setSettings,
    resetSettings
  };
}
