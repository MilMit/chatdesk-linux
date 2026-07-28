# ChatDesk Linux 0.5.1

This maintenance release improves how the Debian package appears in Ubuntu App Center and other AppStream-compatible Linux software centers.

## Packaging improvements

- Displays **ChatDesk Linux** instead of the lowercase Debian package name when AppStream metadata is honored
- Includes the **MilMit** developer identity
- Declares the **MIT** project license
- Installs a matching application-ID icon
- Includes richer summary, description, category, homepage, bug tracker, and release metadata
- Adds complete Debian maintainer and vendor fields

Ubuntu may still display a third-party safety warning when a `.deb` is opened directly from Downloads. That warning identifies sideloaded packages that did not come from a trusted configured repository; it is not removed by cosmetic package metadata.

## Verify downloads

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

ChatDesk Linux is unofficial and is not affiliated with OpenAI.
