# Changelog

All notable changes to OpenCodeKit are documented here. The project follows semantic versioning after `1.0.0`; pre-1.0 releases may contain breaking changes in minor versions.

## [0.3.1] - 2026-08-25

### Fixed

- GitHub release installation now works with standard npm and CachyOS's hardened npm 12 defaults.
- Release archives install without requiring a build lifecycle script.

## [0.3.0] - 2026-08-25

### Added

- Searchable multi-provider model picker with live provider discovery.
- Provider labels, keyboard navigation, and automatic first-run model selection.
- Interactive terminal and scrollback clearing with a `--no-clear` opt-out.
- Masked credential entry and Linux Secret Service/private-file storage fallback.
- Animated terminal startup, command completion suggestions, and smoother prompt editing.

### Fixed

- Provider connection errors now surface actionable authentication and network details.
- Provider switching no longer silently retains an incompatible model selection.
- Headless output remains undecorated and machine-readable.

[0.3.1]: https://github.com/zynx-real/opencodekit/releases/tag/v0.3.1
[0.3.0]: https://github.com/zynx-real/opencodekit/releases/tag/v0.3.0
