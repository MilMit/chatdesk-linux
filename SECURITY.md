# Security Policy

## Supported versions

Only the latest release is supported with security fixes.

## Reporting a vulnerability

Do not publish sensitive vulnerability details in a public issue. Use GitHub private vulnerability reporting for this repository.

Include:

- affected version;
- operating system and display protocol;
- reproduction steps;
- expected and actual behavior;
- a minimal proof of concept when safe.

Never include cookies, tokens, account details, or conversation content.

## Remote-content security model

ChatDesk displays remote ChatGPT content and therefore:

- loads only approved HTTPS application and authentication origins;
- disables Node.js integration for remote content;
- enables context isolation and Chromium sandboxing;
- blocks unknown navigation schemes and lookalike domains;
- restricts popup creation and external-link handling;
- denies permissions by default;
- permits only sanitized clipboard writes on approved ChatGPT/OpenAI origins while denying clipboard reads;
- validates IPC senders and exposes explicit channel allowlists;
- does not inject custom JavaScript or CSS into ChatGPT.

## Local data

- Profile sessions use separate persistent Electron partitions.
- Settings, logs, workspace definitions, prompt templates, and download history are written with restrictive local permissions.
- Capture history is opt-in and rejects likely secrets.
- Capture history uses Electron safe storage when a real Linux secret-service backend is available. `basic_text` is not treated as secure encryption; ChatDesk falls back to file permissions and reports the limitation.
- Issue reports and log exports exclude cookies, prompts, and conversation content by design, but users must review reports before publishing.

## Release supply chain

Public tagged releases include:

- SHA-256 checksums;
- an SPDX software bill of materials;
- GitHub artifact build-provenance attestations;
- GitHub SBOM attestations;
- CodeQL scanning, dependency review, and Dependabot configuration.

These attestations are not the same as traditional GPG package signatures. A committed lockfile is also required before claiming deterministic dependency resolution.

No desktop wrapper can guarantee availability or compatibility of a third-party website.
