import { useCallback, useEffect, useRef, useState } from 'react';

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSpeechText({ title, summary, content, sourceName, publishedAt, mode }) {
  let body = '';
  if (mode === 'full' && content) {
    body = stripHtml(content);
  } else {
    body = summary ? stripHtml(summary) : stripHtml(content);
  }

  const metaParts = [];
  if (sourceName) metaParts.push(sourceName);
  if (publishedAt) {
    try {
      const d = new Date(publishedAt);
      if (!Number.isNaN(d.getTime())) {
        metaParts.push(d.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      }
    } catch {
      // ignore
    }
  }

  const meta = metaParts.length > 0 ? metaParts.join(' · ') + '。' : '';
  return `${meta}${title}。${body}`;
}

export function useSpeech(options = {}) {
  const { rate = 1.05, pitch = 1.0, voiceURI = '' } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [voices, setVoices] = useState([]);

  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const optionsRef = useRef({ rate, pitch, voiceURI });

  useEffect(() => {
    optionsRef.current = { rate, pitch, voiceURI };
  }, [rate, pitch, voiceURI]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    setIsSupported(true);

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices() || [];
      setVoices(available);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const resolveVoice = useCallback((uri) => {
    if (!uri) return null;
    return voices.find((v) => v.voiceURI === uri) || null;
  }, [voices]);

  const speakText = useCallback((text, onEnd) => {
    if (!isSupported || !text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = optionsRef.current.rate;
    utterance.pitch = optionsRef.current.pitch;

    const selectedVoice = resolveVoice(optionsRef.current.voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported, resolveVoice]);

  const playNext = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx >= queueRef.current.length) {
      setIsPlaying(false);
      return;
    }

    const item = queueRef.current[idx];
    const text = typeof item === 'string' ? item : formatSpeechText(item);
    const onEnd = typeof item === 'string' ? undefined : item.onEnd;

    speakText(text, () => {
      if (onEnd) onEnd();
      currentIndexRef.current = idx + 1;
      setCurrentIndex(idx + 1);
      playNext();
    });
  }, [speakText]);

  const playQueue = useCallback((items) => {
    if (!isSupported || !items || items.length === 0) return;
    window.speechSynthesis.cancel();
    queueRef.current = items;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setTotal(items.length);
    setIsPlaying(true);
    playNext();
  }, [isSupported, playNext]);

  const playSingle = useCallback((item) => {
    if (!isSupported || !item) return;
    window.speechSynthesis.cancel();
    queueRef.current = [item];
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setTotal(1);
    setIsPlaying(true);

    const text = typeof item === 'string' ? item : formatSpeechText(item);
    const onEnd = typeof item === 'string' ? undefined : item.onEnd;

    speakText(text, () => {
      if (onEnd) onEnd();
      setIsPlaying(false);
    });
  }, [isSupported, speakText]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    queueRef.current = [];
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setTotal(0);
    setIsPlaying(false);
  }, []);

  const next = useCallback(() => {
    window.speechSynthesis.cancel();
    const idx = currentIndexRef.current + 1;
    if (idx >= queueRef.current.length) {
      setIsPlaying(false);
      return;
    }
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    setIsPlaying(true);

    const item = queueRef.current[idx];
    const text = typeof item === 'string' ? item : formatSpeechText(item);
    const onEnd = typeof item === 'string' ? undefined : item.onEnd;

    speakText(text, () => {
      if (onEnd) onEnd();
      currentIndexRef.current = idx + 1;
      setCurrentIndex(idx + 1);
      playNext();
    });
  }, [speakText, playNext]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return {
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
  };
}

export { formatSpeechText };
