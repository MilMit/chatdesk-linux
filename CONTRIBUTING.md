# Contributing

Contributions are welcome, but security regressions will not be accepted for convenience.

## Development

```bash
npm install
npm test
npm run check
npm start
```

## Pull requests

- Create a focused branch.
- Add tests for navigation or security policy changes.
- Do not add arbitrary domains to the allowlist without explaining why they are required.
- Do not enable Node.js integration, disable context isolation, disable the sandbox, or disable web security.
- Keep the application clearly marked as unofficial.
