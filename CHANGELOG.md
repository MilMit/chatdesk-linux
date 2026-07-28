# Changelog

## 0.5.0 - 2026-07-28

- Added Quick Capture for the Linux clipboard and selection buffer with profile and destination selection.
- Added independent persistent profile windows with saved bounds and profile-specific visual markers.
- Added animated Compact Mode with left/right docking and always-on-top behavior.
- Added Workspace presets with profile, dimensions, compact mode, zoom, theme, start page, and optional shortcuts.
- Added a local Prompt Library with variables, categories, favorites, and shortcuts.
- Expanded the Command Palette with fuzzy search, recent commands, favorites, profiles, prompts, and workspaces.
- Added `chatdesk://` deep links, Linux file associations, desktop actions, and a local Share staging queue.
- Added opt-in capture history with secret filtering, bounded storage, file mode 0600, and secure Linux keyring encryption when available.
- Added Installation Health, Log Viewer, and a privacy-safe Report Issue wizard.
- Added CodeQL, dependency review, SPDX SBOM generation, SHA-256 checksums, and GitHub build/SBOM attestations.
- Added 57 unit and contract tests covering new stores, deep links, IPC contracts, protected captures, and issue-report privacy.

## 0.4.0 - 2026-07-28

- Fixed ChatGPT copy buttons failing by allowing only Chromium's sanitized clipboard-write permission on trusted ChatGPT/OpenAI origins; clipboard reads remain blocked.
- Added a native main-process clipboard path with visible error handling for Diagnostics and Quick Chat.
- Added a searchable Command Palette with a configurable global shortcut.
- Added English and Persian local interfaces, native-menu translation, and RTL layout.
- Added profile colors and icons with automatic migration of existing profiles.
- Added first-run onboarding and optional once-per-day GitHub release checks.
- Added real Electron UI smoke testing under Xvfb and stronger renderer/preload/IPC contract tests.
- Added SHA-256 checksum generation to GitHub Releases.

## 0.3.1 - 2026-07-28

- Added an animated floating Activity Center that remains visible over the remote ChatGPT view without restoring the fragile custom toolbar.
- Added live download cards with progress, speed, pause, resume, cancel, open-file, show-in-folder, and dismiss actions.
- Added brief connecting/connected activity states and reusable app-message toasts.
- Added native Linux taskbar/dock progress, active-download counts in the window title, and download counts in the tray menu.
- Added Activity Center preferences for visibility, connection status, and automatic dismissal of finished downloads.
- Kept Safe Mode free of floating windows and animations.

## 0.3.0 - 2026-07-28

- Removed the unreliable custom title bar and restored native Linux window controls and menus.
- Added Diagnostics, file logging, Safe Mode, crash recovery, isolated profiles, settings import/export, and launcher actions.
- Expanded download history and native menu/tray integrations.

## 0.2.5 - 2026-07-28

- Fixed the Linux toolbar IPC bridge by disabling Chromium renderer sandboxing only for the trusted bundled shell and Quick Chat windows.
- Kept the remote ChatGPT `WebContentsView` sandboxed and isolated.
- Added explicit preload failure and renderer error logging.
- Added a visible `Interface error` state when the bridge is unavailable instead of leaving the toolbar silently dead.

## 0.2.4

- Fixed every custom titlebar and panel control being non-responsive.
- Converted sandboxed preload scripts from unsupported ESM imports to CommonJS.
- Added explicit IPC channel allowlists instead of exposing unrestricted renderer IPC.
- Added regression tests for preload format and main-window preload paths.

## 0.2.3

- Fixed electron-builder 26 Linux desktop-entry schema.
- Moved desktop metadata under `linux.desktop.entry`.
- Enabled desktop filename and StartupWMClass synchronization with the application ID.


## 0.2.2

- Replaced the two-sibling `WebContentsView` shell with a local `BrowserWindow` plus one remote child view.
- Fixed titlebar, Settings, minimize, maximize, and close controls becoming non-interactive after login/navigation on Linux.
- Hide the remote ChatGPT view while Settings, Downloads, About, Splash, or Offline UI is open.
- Added layout and visibility regression tests.

## 0.2.1

- Fixed the startup screen remaining on Connecting indefinitely.
- Reveal ChatGPT after DOM readiness, navigation completion, loading stop, or a safe timeout.
- Removed the Electron product token from the Chromium user agent for web compatibility.
- Added main-frame navigation diagnostics to the terminal.
- Kept the splash animation decorative rather than making app visibility depend on renderer IPC.


## 0.2.0

- Added an animated startup screen with a short fade transition.
- Replaced the single remote window with a local secure shell plus `WebContentsView`.
- Added a custom draggable title bar, loading indicator, connection state, and window controls.
- Added offline detection, a dedicated error screen, and retry flow.
- Added persistent window size, position, and maximized state.
- Added system tray controls and minimize-to-tray behavior.
- Added global shortcuts, including Wayland portal support.
- Added a floating Quick Chat prompt copier without DOM injection.
- Added settings for theme, startup, tray behavior, acceleration, zoom, spellcheck, notifications, external links, shortcuts, and downloads.
- Added download progress, cancel/pause/resume, open, show-in-folder, and native completion notifications.
- Added a manual GitHub release update check and About panel.
