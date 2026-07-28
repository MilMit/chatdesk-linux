import { isTrustedAppUrl } from './navigation-policy.js';

const ALLOWED_MEDIA_TYPES = new Set(['audio', 'video']);
const ALLOWED_SIMPLE_PERMISSIONS = new Set([
  'notifications',
  'clipboard-sanitized-write',
]);

function normalizeMediaTypes({ mediaType, mediaTypes }) {
  if (Array.isArray(mediaTypes) && mediaTypes.length > 0) return mediaTypes;
  if (typeof mediaType === 'string' && mediaType.length > 0) return [mediaType];
  return [];
}

export function isPermissionAllowed({ permission, requestingUrl, mediaType, mediaTypes }) {
  if (!isTrustedAppUrl(requestingUrl)) return false;
  if (ALLOWED_SIMPLE_PERMISSIONS.has(permission)) return true;

  if (permission === 'media') {
    const requestedMediaTypes = normalizeMediaTypes({ mediaType, mediaTypes });
    return requestedMediaTypes.length > 0
      && requestedMediaTypes.every((type) => ALLOWED_MEDIA_TYPES.has(type));
  }

  return false;
}
