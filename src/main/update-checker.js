import { compareVersions } from './version-utils.js';

const LATEST_RELEASE_API = 'https://api.github.com/repos/milmit/chatdesk-linux/releases/latest';
const RELEASES_URL = 'https://github.com/milmit/chatdesk-linux/releases';

function supportedAssets(assets) {
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => /\.(AppImage|deb)$/i.test(asset?.name ?? ''))
    .map((asset) => ({ name: asset.name, url: asset.browser_download_url, size: asset.size ?? 0 }));
}

export async function checkForUpdates(currentVersion) {
  const { net } = await import('electron');
  const response = await net.fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ChatDesk-Linux/${currentVersion}` },
  });
  if (response.status === 404) return { status: 'none', message: 'No published release was found yet.', url: RELEASES_URL, assets: [] };
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const release = await response.json();
  const latestVersion = String(release.tag_name ?? '').replace(/^v/i, '');
  if (!latestVersion) throw new Error('The release did not contain a version tag.');
  return {
    status: compareVersions(latestVersion, currentVersion) > 0 ? 'available' : 'current',
    currentVersion,
    latestVersion,
    name: release.name || `v${latestVersion}`,
    url: release.html_url || RELEASES_URL,
    changelog: String(release.body || '').slice(0, 6000),
    publishedAt: release.published_at || '',
    assets: supportedAssets(release.assets),
  };
}
