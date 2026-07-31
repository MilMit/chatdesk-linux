import { shell } from 'electron';
import { classifyUrl } from './navigation-policy.js';
import { isPermissionAllowed } from './permission-policy.js';

const configuredSessions = new WeakSet();
let externalLinksEnabled = true;

const BASE_SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  backgroundThrottling: true,
});

export function getSecureWebPreferences(partition) {
  return { ...BASE_SECURE_WEB_PREFERENCES, partition };
}

export const secureWebPreferences = getSecureWebPreferences('persist:chatdesk-profile-personal');

export function setExternalLinksEnabled(enabled) {
  externalLinksEnabled = enabled === true;
}

export function configureSession(targetSession) {
  if (configuredSessions.has(targetSession)) return;
  configuredSessions.add(targetSession);

  targetSession.setPermissionCheckHandler((contents, permission, origin, details) => (
    isPermissionAllowed({
      permission,
      requestingUrl: details?.requestingUrl || origin || contents?.getURL?.() || '',
      mediaType: details?.mediaType,
    })
  ));

  targetSession.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
    callback(isPermissionAllowed({
      permission,
      requestingUrl: details.requestingUrl || contents?.getURL?.() || '',
      mediaTypes: details.mediaTypes,
    }));
  });

  targetSession.setDevicePermissionHandler(() => false);
  targetSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

async function openExternalSafely(url) {
  if (!externalLinksEnabled || classifyUrl(url) !== 'external') return;
  try {
    await shell.openExternal(url);
  } catch (error) {
    console.error('Failed to open external URL:', error);
  }
}

function handleNavigation(event, url) {
  const classification = classifyUrl(url);
  if (classification === 'app' || classification === 'auth' || classification === 'blank') return;
  event.preventDefault();
  if (classification === 'external') void openExternalSafely(url);
}

export function secureWebContents(contents) {
  configureSession(contents.session);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-navigate', handleNavigation);
  contents.on('will-redirect', handleNavigation);
  contents.setWindowOpenHandler(({ url }) => {
    const classification = classifyUrl(url);
    if (classification === 'app' || classification === 'auth' || classification === 'blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { ...BASE_SECURE_WEB_PREFERENCES },
        },
      };
    }
    if (classification === 'external') void openExternalSafely(url);
    return { action: 'deny' };
  });
}
