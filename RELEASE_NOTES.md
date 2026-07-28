# ChatDesk Linux 0.5.0

This release turns ChatDesk from a hardened web wrapper into a Linux productivity shell while keeping remote ChatGPT content isolated.

## Major additions

- Quick Capture from clipboard or Linux selection
- Independent windows for Personal, Work, Testing, and custom profiles
- Compact Mode with animated left/right docking
- Workspace presets
- Prompt Library with local variables
- Advanced Command Palette with fuzzy search, favorites, and recent commands
- `chatdesk://` protocol links
- Share-to-ChatDesk file staging and drag-and-drop
- Opt-in capture history protected by the Linux keyring when available
- Installation Health, Log Viewer, and Report Issue wizard
- Release SBOMs, checksums, CodeQL, dependency review, and signed GitHub attestations

## Deliberate limits

ChatDesk still does not inject scripts into ChatGPT, automatically submit prompts, or silently upload staged files. Quick Capture copies prepared text and opens the requested destination; the user pastes or uploads it explicitly.

Capture history remains disabled by default. Likely secrets are rejected. On Linux systems without a secure keyring backend, ChatDesk falls back to mode-0600 local storage and clearly reports that limitation.

## Verify downloads

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

For public GitHub releases:

```bash
gh attestation verify ./chatdesk-linux-0.5.0-x86_64.AppImage -R milmit/chatdesk-linux
```

ChatDesk Linux is unofficial and is not affiliated with OpenAI.
