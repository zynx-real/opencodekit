# OpenCodeKit

[![CI](https://github.com/zynx-real/opencodekit/actions/workflows/ci.yml/badge.svg)](https://github.com/zynx-real/opencodekit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E.svg)](https://nodejs.org/)

OpenCodeKit is an open-source AI coding agent for the terminal. It can inspect a repository, search and edit files, run commands and diagnostics, work with Git, connect MCP servers, switch providers without losing the conversation, and resume saved sessions.

It is an independent implementation built with TypeScript, Ink, Vercel AI SDK, and the official MCP SDK. The safe default is an approval-based permission policy; repository text and tool output cannot grant themselves additional permissions.

```text
$ opencodekit

OpenCodeKit                    main · openrouter/… · ASK
~/projects/my-app

> Fix the login validation and run the focused tests.

● search_repository LoginForm
  ✓ search_repository 18ms
● read_file src/components/LoginForm.tsx
  ✓ read_file 2ms
● edit_file src/components/LoginForm.tsx
  Permission required: modify src/components/LoginForm.tsx (y/N)
● bash npm test -- LoginForm
  ✓ bash 1421ms

Done. Validation now runs before submission and the eight focused tests pass.
```

## Install

OpenCodeKit requires Node.js 20 or newer.

Install the latest GitHub version:

```bash
npm install -g github:zynx-real/opencodekit
opencodekit
```

The npm package identifier is `opencodekit-agent` and the executable is `opencodekit`. A registry installation command will be documented after the first npm release; the existing unscoped `opencodekit` package belongs to another project.

For local development:

```bash
git clone https://github.com/zynx-real/opencodekit.git
cd opencodekit
npm install
npm run dev
```

The repository and executable are named `opencodekit`.

## Quick start

Set a provider credential and start the agent from a repository:

```bash
export OPENAI_API_KEY=...
opencodekit --provider openai --model <model-id>
```

OpenCodeKit does not hardcode a model that may become stale. Put a model in configuration, pass `--model`, or query a provider's live model API:

```bash
opencodekit models openrouter
opencodekit --provider openrouter --model <provider/model-id>
```

The interactive UI clears the terminal and scrollback, then opens with an animated startup screen. If no model is configured, a searchable model window opens automatically. It combines every connected provider, displays the model on the left and its provider on the right, and supports arrow keys, Page Up/Down, Enter, and live filtering. Use `--no-clear` when you want to preserve existing terminal contents.

You can reopen the model window at any time with `/model`. The built-in onboarding commands remain available, and Tab completes each command and provider name:

```text
/provider openai
/auth openai
/model <model-id>
/connect
```

`/auth` uses a masked input—the key is never echoed into the terminal or conversation. Credentials can also stay in environment variables or be entered before startup:

```bash
opencodekit auth login openrouter
opencodekit auth list
opencodekit auth logout openrouter
```

Keys are never written to project configuration, sessions, model prompts, or logs. OpenCodeKit prefers macOS Keychain or Linux Secret Service. When neither is usable (common on minimal CachyOS installations), it explicitly reports that it stored credentials in the platform data directory using a private `0600` file inside a `0700` directory. Environment variables remain available for users who do not want local persistence.

## Providers

| Provider             | Adapter                              | Credential                                         |
| -------------------- | ------------------------------------ | -------------------------------------------------- |
| OpenAI               | Official AI SDK                      | `OPENAI_API_KEY`                                   |
| Anthropic            | Official AI SDK                      | `ANTHROPIC_API_KEY`                                |
| Google Generative AI | Official AI SDK                      | `GOOGLE_GENERATIVE_AI_API_KEY`                     |
| xAI                  | Official AI SDK                      | `XAI_API_KEY`                                      |
| Azure OpenAI         | Official AI SDK                      | `AZURE_API_KEY`                                    |
| Amazon Bedrock       | Official AI SDK/AWS credential chain | `AWS_ACCESS_KEY_ID` and standard AWS configuration |
| Groq                 | Official AI SDK                      | `GROQ_API_KEY`                                     |
| Mistral              | Official AI SDK                      | `MISTRAL_API_KEY`                                  |
| Together.ai          | Official AI SDK                      | `TOGETHER_AI_API_KEY`                              |
| Fireworks            | Official AI SDK                      | `FIREWORKS_API_KEY`                                |
| Cerebras             | Official AI SDK                      | `CEREBRAS_API_KEY`                                 |
| Cohere               | Official AI SDK                      | `COHERE_API_KEY`                                   |
| DeepInfra            | Official AI SDK                      | `DEEPINFRA_API_KEY`                                |
| Perplexity           | Official AI SDK                      | `PERPLEXITY_API_KEY`                               |
| OpenRouter           | Maintained OpenAI-compatible adapter | `OPENROUTER_API_KEY`                               |
| DeepSeek             | Maintained OpenAI-compatible adapter | `DEEPSEEK_API_KEY`                                 |
| Local/Ollama/custom  | Maintained OpenAI-compatible adapter | Configurable/optional                              |

Capabilities such as reasoning, images, structured output, and tools are model-dependent. OpenCodeKit does not invent capability or pricing metadata when a provider does not supply it.

OpenRouter is dynamically queried rather than reduced to a fixed list:

```bash
export OPENROUTER_API_KEY=...
opencodekit models openrouter
opencodekit -p "explain this repository" \
  --provider openrouter \
  --model <provider/model-id>
```

## Local and compatible models

Create `.opencodekit/config.json` in a repository:

```json
{
  "provider": "local",
  "model": "your-loaded-model",
  "providers": {
    "local": {
      "type": "openai-compatible",
      "baseURL": "http://localhost:1234/v1",
      "models": ["your-loaded-model"]
    }
  }
}
```

Ollama's OpenAI-compatible endpoint is available as provider `ollama` at `http://localhost:11434/v1`. Any other compatible service can be named and configured:

```json
{
  "provider": "my-cloud",
  "model": "my-model",
  "providers": {
    "my-cloud": {
      "type": "openai-compatible",
      "baseURL": "https://example.com/v1",
      "apiKeyEnv": "MY_CLOUD_API_KEY",
      "headers": { "X-Tenant": "example" },
      "models": ["my-model"]
    }
  }
}
```

`mock/mock` is an explicit offline verification provider. It is useful for installation checks and tests; it does not masquerade as a coding-capable model.

## Permissions and modes

The modes are:

- `ask` (default): reads are automatic; edits, deletion, and arbitrary commands ask first.
- `auto-edit`: file writes are automatic; deletion and arbitrary commands still ask.
- `plan`: read-only inspection; state-changing tools are rejected.
- `unrestricted`: advanced opt-in mode with no prompts.

High-risk commands are labeled explicitly. Common read-only commands and configured patterns can be allowed:

```json
{
  "permissions": {
    "mode": "ask",
    "bash": {
      "allow": ["git status", "git diff*", "npm test*", "cargo test*"]
    }
  }
}
```

Headless `ask` mode has no interactive approver, so consequential tools are denied. Use `--permission-mode auto-edit` or `--permission-mode unrestricted` only when that is intentional.

## Built-in tools

The agent receives typed tools for:

- line-ranged, binary-safe file reads;
- atomic writes, exact multi-edits, validated unified patches, and deletion;
- directory listing, globbing, ripgrep search with a JavaScript fallback;
- executable-and-argument shell commands with timeout, cancellation, and output limits;
- Git status, diff, log, and show;
- project diagnostics.

All file tools resolve paths and symlinks before access and stay within the repository root. An edit journal powers `/undo`, `/redo`, and `/diff` without resetting Git or overwriting unrelated user changes.

## MCP

Both local stdio and remote Streamable HTTP servers are supported:

```bash
opencodekit mcp add filesystem \
  --transport stdio \
  --command npx \
  --arg -y @modelcontextprotocol/server-filesystem /path/to/root

opencodekit mcp add remote \
  --transport http \
  --url https://example.com/mcp

opencodekit mcp list
opencodekit mcp test
opencodekit mcp remove remote
```

MCP tools are namespaced as `server__tool`, so a server cannot replace built-in tools. Transport failures are reported without making the rest of the CLI unusable.

## Sessions

Sessions are saved in one atomic database file under the platform-specific application data directory. They include messages, model/tool results, compacted summaries, provider/model selection, and token usage—but never credentials.

```bash
opencodekit --continue
opencodekit --resume <session-id>
opencodekit --fork <session-id>
opencodekit sessions
```

Automatic context-overflow recovery compacts older history once and retries. `/compact` performs manual compaction while retaining recent messages, the repository, changed files, current goal, and unresolved state.

## Headless use

```bash
opencodekit -p "explain this repository" --provider openai --model <id>
opencodekit -p "run tests and summarize failures" --output json
opencodekit -p "review this change" --output stream-json
git diff | opencodekit -p "review this diff"
```

`json` emits one stable versioned object. `stream-json` emits JSON Lines events. Human decoration never appears on JSON stdout; warnings go to stderr. Piped input is marked as untrusted context rather than instructions.

## Interactive commands

```text
/help         /auth         /connect       /model
/provider     /mode         /permissions   /mcp
/context      /compact      /diff          /undo
/redo         /sessions     /clear         /cost
/exit
```

Typing `/` opens instant local completion suggestions. Continue typing to filter and press Tab to accept. Provider, model, and permission-mode arguments are completed without a network request. The input supports cursor movement, Home/End, editing in the middle, masked secrets, Shift/Alt+Enter multiline prompts, and Up/Down history. Ctrl+C cancels active work, cancels API-key entry, or exits while idle.

`/model` queries all connected providers concurrently and opens the combined selector. Saving a key with `/auth <provider>` refreshes that selector immediately. Azure OpenAI, Bedrock, and providers without a list API can supply exact IDs through `providers.<id>.models` in configuration.

`/connect` makes a tiny explicit provider request and reports latency. Connection failures distinguish rejected keys, account permissions, missing model IDs, rate limits, provider outages, TLS errors, and unreachable local endpoints.

## Configuration

Global configuration uses the correct platform directory (for example, XDG config on Linux). Repository configuration lives at `.opencodekit/config.json` and overrides global values recursively.

```json
{
  "provider": "openrouter",
  "model": "provider/model-id",
  "fallback": ["openai/model-id"],
  "permissions": {
    "mode": "ask"
  },
  "agent": {
    "maxTurns": 50,
    "maxContextTokens": 120000
  },
  "mcp": {}
}
```

Set `OPENCODEKIT_CONFIG_DIR` and `OPENCODEKIT_DATA_DIR` to override platform locations. Configuration is validated with Zod and errors include exact property paths.

Use `--verbose` or `OPENCODEKIT_LOG=debug` for redacted JSON diagnostics on stderr. Logs include provider timing, tool lifecycle, fallback, MCP, and session events; keys, auth headers, and credential-shaped fields are redacted.

Repository context includes root instruction/metadata files and nested `AGENTS.md` files (scoped to their subtrees): `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, and other common manifests. It is selected and size-limited rather than recursively dumping the repository.

## Development

```bash
npm install
npm run dev -- --provider mock --model mock
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Tests never call paid APIs. They use AI SDK mock models and a real local stdio MCP fixture.

The main architecture is:

```text
src/
  cli/          commands and headless protocols
  tui/          Ink presentation and approval UI
  agent/        multi-step ToolLoopAgent orchestration
  providers/    provider registry and model discovery
  tools/        typed repository, edit, search, shell, Git tools
  permissions/  policy and approval boundary
  context/      repository instructions and pruning
  sessions/     persistence, branching, compaction, usage
  mcp/          stdio/HTTP MCP lifecycle and namespacing
  lsp/          non-fatal project diagnostics
  git/          repository discovery
  config/       layered Zod-validated configuration
  auth/         keychain and private-file credential storage
```

## Security model

- Safe permission mode is the default; model output never bypasses it.
- Repository, MCP, web, command, and piped text are treated as untrusted.
- File access is repository-confined and checks symlink resolution.
- Commands are spawned as an executable plus arguments, without an implicit shell.
- Pre-existing Git changes are never reset, cleaned, committed, or pushed automatically.
- Secrets are not placed in prompts, sessions, JSON output, or logs.
- Telemetry is not included.

## Current limitations

- Provider model/capability/pricing metadata varies. OpenCodeKit queries live provider catalogs where available and uses explicitly configured model IDs for providers without a list API. It does not invent capability or pricing metadata.
- LSP support currently runs practical project diagnostics (`tsc`, Cargo, or Go) rather than maintaining full hover/definition/reference language-server sessions.
- The private-file credential fallback relies on operating-system file permissions. Users who require hardware-backed secret storage should install/configure their OS keyring or use environment injection.
- Standalone Bun executables are not shipped; the npm package is the supported distribution because provider and credential integrations depend on the Node ecosystem.
- Session storage is one atomic JSON database rather than SQLite. This avoids native database dependencies and hundreds of fragile per-session files, but it is intended for individual local use rather than concurrent multi-process writers.

## License and acknowledgements

OpenCodeKit is MIT licensed. It uses Vercel AI SDK, Ink, the Model Context Protocol SDK, Zod, and other permissively licensed dependencies. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No implementation code was copied from proprietary coding agents.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, use [GitHub Issues](https://github.com/zynx-real/opencodekit/issues) for reproducible bugs and feature proposals, and follow [SECURITY.md](SECURITY.md) for private vulnerability reports.
