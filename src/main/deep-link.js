const ALLOWED_PANELS = new Set(['settings', 'downloads', 'diagnostics', 'prompts', 'workspaces', 'captures', 'logs', 'health', 'share', 'report']);

function cleanId(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value) ? value : '';
}

export function parseDeepLink(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'chatdesk:') return null;
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/^\/+/, '').toLowerCase();
  const action = host || pathname;
  const profileId = cleanId(url.searchParams.get('profile'));

  if (action === 'new') return { type: 'new-chat', profileId };
  if (action === 'capture' || action === 'quick') return { type: 'quick-capture', profileId };
  if (action === 'profile') return profileId ? { type: 'profile-window', profileId } : null;
  if (action === 'workspace') {
    const workspaceId = cleanId(url.searchParams.get('id'));
    return workspaceId ? { type: 'workspace', workspaceId } : null;
  }
  if (action === 'open') {
    const panel = pathname || url.searchParams.get('panel') || '';
    return ALLOWED_PANELS.has(panel) ? { type: 'panel', panel } : null;
  }
  if (ALLOWED_PANELS.has(action)) return { type: 'panel', panel: action };
  return null;
}

export function findDeepLink(argv = []) {
  return argv.find((entry) => typeof entry === 'string' && entry.toLowerCase().startsWith('chatdesk://')) || '';
}

export function collectSharedFiles(argv = []) {
  return argv.filter((entry) => (
    typeof entry === 'string'
    && entry.length < 4096
    && !entry.startsWith('-')
    && !entry.startsWith('chatdesk://')
    && !entry.endsWith('.asar')
  ));
}
