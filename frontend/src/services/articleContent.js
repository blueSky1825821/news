import DOMPurify from 'dompurify';

const IMAGE_ATTRIBUTES = ['data-src', 'data-lazy-src', 'data-original', '_src'];
const SOURCE_SET_ATTRIBUTES = ['data-srcset', 'data-lazy-srcset', 'srcset'];
const VIDEO_DOMAINS = ['bilibili.com', 'youtube.com', 'youtube-nocookie.com', 'youku.com', 'iqiyi.com', 'v.qq.com'];

function webUrl(value, baseUrl) {
  const input = value?.trim();
  if (!input || /^(?:undefined|null|#.*)$/i.test(input)) return null;
  try {
    const url = new URL(input, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function imageUrl(value, baseUrl) {
  const url = webUrl(value, baseUrl);
  if (!url) return '';
  if (globalThis.location?.protocol === 'https:') url.protocol = 'https:';
  return url.href;
}

function readSourceSet(element, baseUrl) {
  for (const attribute of SOURCE_SET_ATTRIBUTES) {
    const value = element.getAttribute(attribute) || '';
    const candidates = [];
    // Keep commas inside URLs while consuming separators and descriptors in order.
    const tokens = /[\s,]*([^\s]+)/y;
    let match;
    while ((match = tokens.exec(value))) {
      const token = match[1].replace(/,+$/, '');
      let size = '';
      if (token === match[1]) {
        const comma = value.indexOf(',', tokens.lastIndex);
        const end = comma < 0 ? value.length : comma;
        size = value.slice(tokens.lastIndex, end).trim();
        tokens.lastIndex = end + 1;
      }
      const url = imageUrl(token, baseUrl);
      if (url && (!size || /^(?:[1-9]\d*w|\d+(?:\.\d+)?x)$/.test(size))) candidates.push({ url, size });
    }
    if (candidates.length) return candidates;
  }
  return [];
}

function normalizeSourceSet(element, baseUrl) {
  const candidates = readSourceSet(element, baseUrl);
  for (const attribute of SOURCE_SET_ATTRIBUTES) element.removeAttribute(attribute);
  if (candidates.length) {
    element.setAttribute('srcset', candidates.map(({ url, size }) => size ? `${url} ${size}` : url).join(', '));
  }
  return candidates[0]?.url;
}

export function prepareArticleContent(content, originalUrl) {
  const baseUrl = webUrl(originalUrl)?.href;
  const fragment = DOMPurify.sanitize(content || '', {
    RETURN_DOM_FRAGMENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOWED_TAGS: [
      'p', 'br', 'img', 'picture', 'figure', 'figcaption', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'ul', 'ol', 'li', 'video', 'source', 'iframe', 'div', 'span'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'width', 'height', 'frameborder', 'allowfullscreen', 'controls', 'type',
      'media', 'sizes', ...IMAGE_ATTRIBUTES, ...SOURCE_SET_ATTRIBUTES
    ]
  });

  for (const iframe of fragment.querySelectorAll('iframe')) {
    const url = webUrl(iframe.getAttribute('src'), baseUrl);
    if (url && VIDEO_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
      iframe.setAttribute('src', url.href);
    } else {
      iframe.remove();
    }
  }

  for (const source of fragment.querySelectorAll('picture source')) normalizeSourceSet(source, baseUrl);
  for (const img of fragment.querySelectorAll('img')) {
    const lazyUrl = IMAGE_ATTRIBUTES.map(name => imageUrl(img.getAttribute(name), baseUrl)).find(Boolean);
    const fallbackUrl = normalizeSourceSet(img, baseUrl);
    const pictureUrl = img.parentElement?.localName === 'picture'
      ? [...img.parentElement.querySelectorAll('source')].map(source => readSourceSet(source, baseUrl)[0]?.url).find(Boolean)
      : undefined;
    const url = lazyUrl || imageUrl(img.getAttribute('src'), baseUrl) || fallbackUrl || pictureUrl;
    for (const name of IMAGE_ATTRIBUTES) img.removeAttribute(name);
    if (!url) {
      img.removeAttribute('src');
      continue;
    }
    img.setAttribute('src', url);
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  }

  const template = document.createElement('template');
  template.content.append(fragment);
  return template.innerHTML;
}
