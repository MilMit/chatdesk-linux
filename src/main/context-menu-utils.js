const TRACKING_QUERY_KEYS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'mc_cid', 'mc_eid',
  'igshid', 'mkt_tok', 'ref_src', 'ref_url', 'spm', 'yclid',
]);

export function cleanContextText(value, max = 20_000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function quoteText(value) {
  const text = cleanContextText(value);
  return text ? text.split('\n').map((line) => `> ${line}`).join('\n') : '';
}

export function codeBlockText(value) {
  const text = cleanContextText(value);
  if (!text) return '';
  const fence = text.includes('```') ? '````' : '```';
  return `${fence}text\n${text}\n${fence}`;
}

export function markdownText(value, { linkURL = '', linkText = '' } = {}) {
  const text = cleanContextText(value);
  if (linkURL && linkText && text === linkText.trim()) return `[${text}](${linkURL})`;
  return text;
}

export function cleanTrackingUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return value;
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return value;
  }
}
