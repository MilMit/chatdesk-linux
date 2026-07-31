const STREAM_HOSTS = Object.freeze([
  'chatgpt.com',
  'openai.com',
]);

const STREAM_RESOURCE_TYPES = new Set(['xhr', 'other']);
const OBSERVED_CONNECTION_TYPES = new Set(['xhr', 'other', 'webSocket']);
const IGNORED_NETWORK_ERRORS = new Set([
  'net::ERR_ABORTED',
  'net::ERR_BLOCKED_BY_CLIENT',
  'net::ERR_BLOCKED_BY_RESPONSE',
]);

function matchesHost(hostname, allowed) {
  const value = String(hostname || '').toLowerCase();
  return value === allowed || value.endsWith(`.${allowed}`);
}

export function isTrustedStreamHost(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'wss:'
      ? STREAM_HOSTS.some((host) => matchesHost(url.hostname, host))
      : false;
  } catch {
    return false;
  }
}

export function isLongResponseRequest(details = {}) {
  const method = String(details.method || '').toUpperCase();
  return method === 'POST'
    && STREAM_RESOURCE_TYPES.has(details.resourceType)
    && isTrustedStreamHost(details.url);
}

export function isObservedConnectionRequest(details = {}) {
  return OBSERVED_CONNECTION_TYPES.has(details.resourceType)
    && isTrustedStreamHost(details.url);
}

export function isRecoverableConnectionError(details = {}) {
  const error = String(details.error || details.errorDescription || '');
  return isObservedConnectionRequest(details)
    && Boolean(error)
    && !IGNORED_NETWORK_ERRORS.has(error);
}

export function shouldDisableBackgroundThrottling(settings = {}) {
  return settings.keepLongResponsesActive !== false;
}
