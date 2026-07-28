export const PROFILE_STRIP_HEIGHT = 4;

export function getAppViewBounds({ width, height }, { profileStrip = true } = {}) {
  const safeWidth = Math.max(0, Math.trunc(Number(width) || 0));
  const safeHeight = Math.max(0, Math.trunc(Number(height) || 0));
  const inset = profileStrip && safeHeight > PROFILE_STRIP_HEIGHT ? PROFILE_STRIP_HEIGHT : 0;
  return { x: 0, y: inset, width: safeWidth, height: Math.max(0, safeHeight - inset) };
}

export function shouldShowAppView({ chromeMode, appRevealed, mainFrameLoadFailed }) {
  return chromeMode === 'app' && appRevealed === true && mainFrameLoadFailed !== true;
}
