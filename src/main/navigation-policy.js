const APP_HOSTS = Object.freeze([
  'chatgpt.com',
  'openai.com',
]);

const AUTH_HOSTS = Object.freeze([
  'accounts.google.com',
  'appleid.apple.com',
  'login.live.com',
  'login.microsoftonline.com',
]);

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);

function hostnameMatches(hostname, allowedDomain) {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = allowedDomain.toLowerCase();

  return normalizedHostname === normalizedDomain
    || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

export function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isTrustedAppUrl(value) {
  const url = parseUrl(value);

  if (!url || url.protocol !== 'https:') {
    return false;
  }

  return APP_HOSTS.some((domain) => hostnameMatches(url.hostname, domain));
}

export function isTrustedAuthUrl(value) {
  const url = parseUrl(value);

  if (!url || url.protocol !== 'https:') {
    return false;
  }

  return AUTH_HOSTS.some((domain) => hostnameMatches(url.hostname, domain));
}

export function isSafeExternalUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && SAFE_EXTERNAL_PROTOCOLS.has(url.protocol));
}

export function classifyUrl(value) {
  if (value === 'about:blank') {
    return 'blank';
  }

  if (isTrustedAppUrl(value)) {
    return 'app';
  }

  if (isTrustedAuthUrl(value)) {
    return 'auth';
  }

  if (isSafeExternalUrl(value)) {
    return 'external';
  }

  return 'blocked';
}

export const navigationPolicy = Object.freeze({
  appHosts: APP_HOSTS,
  authHosts: AUTH_HOSTS,
  safeExternalProtocols: [...SAFE_EXTERNAL_PROTOCOLS],
});
