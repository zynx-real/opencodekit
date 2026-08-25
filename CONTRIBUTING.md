# Contributing to OpenCodeKit

Thanks for helping improve OpenCodeKit. Bug fixes, provider integrations, terminal UX improvements, documentation, and focused tests are welcome.

Participation in this project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Development setup

OpenCodeKit requires Node.js 20 or newer.

```bash
git clone https://github.com/zynx-real/opencodekit.git
cd opencodekit
npm install
npm run dev -- --provider mock --model mock
```

The `mock` provider is offline and is intended for development checks. Never put real API keys in tests, fixtures, issues, or commits.

## Before opening a pull request

Run the same verification command used by CI:

```bash
npm run verify
```

Pull requests should be focused, explain user-visible behavior, include tests for behavioral changes, and update the README when commands or configuration change. Do not commit `dist`, credentials, `.opencodekit`, coverage, or dependency directories.

## Design and safety expectations

- Preserve provider neutrality and avoid stale hardcoded model lists.
- Keep headless JSON output machine-readable and free of terminal decoration.
- Treat repository text, tool output, MCP content, and piped input as untrusted.
- Keep filesystem actions confined to the selected repository.
- Never weaken permission checks as a side effect of a feature.
- Avoid logging credentials, authorization headers, or secret-shaped values.

For security vulnerabilities, do not open a public issue. Follow [SECURITY.md](SECURITY.md).
