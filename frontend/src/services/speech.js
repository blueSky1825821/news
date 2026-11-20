export const NEWS_RATE = 0.95;

export const ANCHOR_VOICES = [
  { id: 'anchor:male', label: '男主持人', names: ['Yunyang', 'Yunxi', 'Yunfeng', 'Kangkang'] },
  { id: 'anchor:female', label: '女主持人', names: ['Xiaoxiao', 'Xiaoyi', 'Huihui', 'Yaoyao', 'Tingting'] }
];

const paragraphTags = 'p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote, section, article';
const sentenceEnd = /[。！？!?；;]+[”’」』）"']*|\.(?=\s|$)|\n+/g;
const englishPhrase = /[A-Za-z]+[A-Za-z0-9]*(?:[.'’+#-][A-Za-z0-9]+)*(?:[+#]+)?(?:[ \t]+(?:[A-Za-z]+[A-Za-z0-9]*(?:[.'’+#-][A-Za-z0-9]+)*(?:[+#]+)?|\d+(?:\.\d+)*))*/g;
const initialisms = /\b(?:AI|API|CPU|GPU|HTML|HTTP|HTTPS|iOS|SDK|UI|URL|USB|VR)\b/g;
const englishPunctuation = { '。': '.', '，': ',', '！': '!', '？': '?', '；': ';', '：': ':', '、': ',' };
const hasSpeech = /[\p{L}\p{N}]/u;

export function speechText(value = '') {
  if (!value) return '';
  if (!/<[a-z][^>]*>|&(?:\w+|#\w+);/i.test(value)) return value;

  const template = document.createElement('template');
  template.innerHTML = value;
  template.content.querySelectorAll('script, style, template, iframe').forEach((node) => node.remove());
  template.content.querySelectorAll(paragraphTags).forEach((node) => {
    node.before('\n');
    node.after('\n');
  });
  return template.content.textContent;
}

export function resolveAnchorVoice(voices, preset) {
  const mandarin = voices.filter((voice) => /^zh-(?:CN|Hans)(?:-|$)/i.test(voice.lang));
  for (const name of preset.names) {
    const pattern = new RegExp(`\\b${name}(?:Neural)?\\b`, 'i');
    const voice = mandarin.find((candidate) => pattern.test(candidate.name));
    if (voice) return voice;
  }
}

export function resolveSpeechVoices(voices, voiceURI, englishVoiceURI) {
  const chinese = voices.filter((voice) => /^zh(?:-|$)/i.test(voice.lang));
  const mandarin = chinese.filter((voice) => /^zh-(?:CN|Hans)(?:-|$)/i.test(voice.lang));
  const english = voices.filter((voice) => /^en(?:-|$)/i.test(voice.lang));
  const natural = (voice) => /natural|neural|online|premium|enhanced/i.test(voice.name);

  const preset = ANCHOR_VOICES.find(({ id }) => id === voiceURI);
  const anchor = preset && resolveAnchorVoice(voices, preset);

  return {
    chinese: anchor || chinese.find((voice) => voice.voiceURI === voiceURI)
      || mandarin.find(natural) || mandarin[0] || chinese.find(natural) || chinese[0],
    english: english.find((voice) => voice.voiceURI === englishVoiceURI)
      || english.find((voice) => natural(voice) && /^en-us$/i.test(voice.lang))
      || english.find(natural) || english.find((voice) => /^en-us$/i.test(voice.lang))
      || english[0]
  };
}

export function speechSegments(value, englishVoice) {
  const segments = [];
  const text = speechText(value).replace(/\r\n?/g, '\n');
  let start = 0;

  function append(text, lang) {
    if (hasSpeech.test(text)) segments.push({ text: text.trim(), lang });
  }

  function sentence(text) {
    if (!englishVoice && /\p{Script=Han}/u.test(text)) {
      append(text.replace(/\bandroid\b/gi, '安卓').replace(initialisms, spellOut), 'zh-CN');
      return;
    }

    let offset = 0;
    for (const match of text.matchAll(englishPhrase)) {
      const before = text.slice(offset, match.index);
      append(before, 'zh-CN');
      offset = match.index + match[0].length;
      const punctuation = text.slice(offset).match(/^[。！？!?；;，,、：:.]+/)?.[0] || '';
      offset += punctuation.length;
      append(match[0]
        .replace(/\bandroid\b/gi, 'Android')
        .replace(/\bOpenAI\b/gi, 'Open A I')
        .replace(/\bChatGPT\b/gi, 'Chat G P T')
        .replace(initialisms, spellOut)
        + punctuation.replace(/[。，！？；：、]/g, (mark) => englishPunctuation[mark]), 'en-US');
    }
    append(text.slice(offset), 'zh-CN');
  }

  for (const match of text.matchAll(sentenceEnd)) {
    const end = match.index + match[0].length;
    const chunk = text.slice(start, end).trim();
    const endsAtLineBreak = match[0].startsWith('\n');
    sentence(endsAtLineBreak && /[\p{L}\p{N}]$/u.test(chunk) ? chunk + '。' : chunk);
    start = end;
  }
  sentence(text.slice(start));
  return segments;
}

function spellOut(word) {
  return word.toUpperCase().split('').join(' ');
}
