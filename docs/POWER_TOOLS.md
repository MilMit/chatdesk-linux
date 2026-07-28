# Power Tools

## Quick Capture

Use `Ctrl+Shift+Space`, choose Selection or Clipboard, apply an optional prompt, choose a profile and destination, then press **Copy & Open**. ChatDesk never automatically submits the prompt.

## Workspaces

Workspaces save a profile, normal or compact window geometry, dock side, always-on-top, zoom, local theme, start page, and optional shortcut.

## Prompt variables

- `{clipboard}` — current regular clipboard text
- `{selection}` — Linux selection buffer when available
- `{date}` — current local date
- `{profile}` — selected profile name

Unknown variables are left untouched rather than executed.

## Deep links

- `chatdesk://new?profile=work`
- `chatdesk://capture?profile=personal`
- `chatdesk://open/settings`
- `chatdesk://workspace?id=coding`
- `chatdesk://profile?profile=testing`

## Sharing files

Open supported files with ChatDesk or drag them into the Share panel. Files are staged locally. Upload remains an explicit user action in ChatGPT.

## Privacy

Capture history is opt-in. It is bounded, filters likely secrets, and uses secure OS storage when available. Prompt Library and Workspace content remain local and are never sent by ChatDesk itself.
