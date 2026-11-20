import { useCallback, useEffect, useRef, useState } from 'react';

import { NEWS_RATE, resolveSpeechVoices, speechSegments, speechText } from '../services/speech.js';

function formatSpeechText({ title, summary, content, sourceName, publishedAt, mode }) {
  if (mode === 'title') return title || '';

  let body = '';
  if (mode === 'full' && content) {
    body = speechText(content);
  } else {
    body = summary ? speechText(summary) : speechText(content);
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

  const meta = metaParts.length > 0 ? metaParts.join('，') + '\n' : '';
  return `${meta}${title || ''}\n${body}`;
}

export function useSpeech(options = {}) {
  const { rate = NEWS_RATE, pitch = 1.0, voiceURI = '', englishVoiceURI = '' } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [voices, setVoices] = useState([]);
  const [playbackError, setPlaybackError] = useState('');
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);

  const playbackRef = useRef(null);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const optionsRef = useRef({ rate, pitch, voiceURI, englishVoiceURI });

  useEffect(() => {
    optionsRef.current = { rate, pitch, voiceURI, englishVoiceURI };
  }, [rate, pitch, voiceURI, englishVoiceURI]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    setIsSupported(true);

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices() || [];
      setVoices(available);
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const cancelPlayback = useCallback(() => {
    const playback = playbackRef.current;
    playbackRef.current = null;
    playback?.controller?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const playNext = useCallback(() => {
    setIsLoadingArticle(false);
    const index = currentIndexRef.current;
    const item = queueRef.current[index];
    if (item === undefined) {
      playbackRef.current = null;
      setIsPlaying(false);
      setTotal(0);
      return;
    }

    const synth = window.speechSynthesis;
    const playback = { utterance: null, controller: null, paused: false, startPending: null };
    playbackRef.current = playback;

    function fail(message) {
      if (playbackRef.current !== playback) return;
      playbackRef.current = null;
      setIsPlaying(false);
      setTotal(0);
      setPlaybackError(message);
    }

    function advance() {
      if (playbackRef.current !== playback) return;
      if (playback.paused) {
        playback.startPending = advance;
        return;
      }

      currentIndexRef.current = index + 1;
      if (currentIndexRef.current < queueRef.current.length) {
        setCurrentIndex(currentIndexRef.current);
      }
      playNext();
    }

    function start(resolvedItem) {
      if (playbackRef.current !== playback) return;
      if (playback.paused) {
        playback.startPending = () => start(resolvedItem);
        return;
      }
      playback.startPending = null;

      const { rate, pitch, voiceURI, englishVoiceURI } = optionsRef.current;
      const available = resolveSpeechVoices(synth.getVoices(), voiceURI, englishVoiceURI);
      const text = typeof resolvedItem === 'string' ? resolvedItem : formatSpeechText(resolvedItem);
      const segments = speechSegments(text, available.english);
      let segmentIndex = 0;

      function speakSegment() {
        if (playbackRef.current !== playback) return;
        const segment = segments[segmentIndex++];
        if (!segment) {
          if (typeof resolvedItem !== 'string') resolvedItem.onEnd?.();
          advance();
          return;
        }

        const voice = segment.lang === 'en-US' ? available.english : available.chinese;
        const utterance = new SpeechSynthesisUtterance(segment.text);
        utterance.lang = voice?.lang || segment.lang;
        utterance.rate = rate;
        utterance.pitch = pitch;
        if (voice) utterance.voice = voice;
        utterance.onend = speakSegment;
        utterance.onerror = () => fail('语音播报失败，请重试或更换音色。');
        playback.utterance = utterance;
        synth.speak(utterance);
      }

      speakSegment();
    }

    if (item.load) {
      playback.controller = new AbortController();
      setIsLoadingArticle(true);
      item.load(playback.controller.signal).then(resolved => {
        if (playbackRef.current !== playback) return;
        setIsLoadingArticle(false);
        start(resolved);
      }, err => {
        if (playbackRef.current !== playback) return;
        setIsLoadingArticle(false);
        setPlaybackError(err.message || '无法加载全文，请重试。');
        advance();
      });
    } else {
      start(item);
    }
  }, []);

  const playQueue = useCallback((items) => {
    if (!isSupported || !items?.length) return;
    cancelPlayback();
    setPlaybackError('');
    queueRef.current = items;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setTotal(items.length);
    setIsPlaying(true);
    window.speechSynthesis.resume();
    playNext();
  }, [cancelPlayback, isSupported, playNext]);

  const playSingle = useCallback((item) => {
    if (item) playQueue([item]);
  }, [playQueue]);

  const pause = useCallback(() => {
    if (!playbackRef.current) return;
    playbackRef.current.paused = true;
    window.speechSynthesis.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playback.paused = false;
    window.speechSynthesis.resume();
    setIsPlaying(true);
    playback.startPending?.();
  }, []);

  const stop = useCallback(() => {
    cancelPlayback();
    queueRef.current = [];
    setIsLoadingArticle(false);
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setTotal(0);
    setIsPlaying(false);
  }, [cancelPlayback]);

  const next = useCallback(() => {
    const index = currentIndexRef.current + 1;
    if (!playbackRef.current || index >= queueRef.current.length) return;
    cancelPlayback();
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setIsPlaying(true);
    window.speechSynthesis.resume();
    playNext();
  }, [cancelPlayback, playNext]);

  useEffect(() => cancelPlayback, [cancelPlayback]);

  return {
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
  };
}

export { formatSpeechText };
