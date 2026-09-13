# beam-apply

[![CI](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/ci.yml/badge.svg)](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/github-code-scanning/codeql)
[![Dependabot Updates](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/dependabot/dependabot-updates)
[![Release](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/release.yml/badge.svg)](https://github.com/ShubhamAvasthi/beam-apply/actions/workflows/release.yml)

[![Firefox Add-on](https://img.shields.io/amo/v/beamapply?logo=firefoxbrowser)](https://addons.mozilla.org/firefox/addon/beamapply/)
[![Chrome Extension](https://img.shields.io/chrome-web-store/v/ccljmdddlchecfojmcjlfmddfbclcnjn?logo=googlechrome)](https://chromewebstore.google.com/detail/beamapply/ccljmdddlchecfojmcjlfmddfbclcnjn)

A fast, deterministic, privacy-first browser extension for autofilling job applications.

## Development & Commands

Make sure you have [Bun](https://bun.sh) installed.

### Development

- **Start dev server (Firefox — the default):**
  ```bash
  bun dev
  ```
- **Start dev server (Chrome):**
  ```bash
  bun dev:chrome
  ```

### Quality & Type Checking

- **Type check (TypeScript):**
  ```bash
  bun compile
  ```
- **Lint (ESLint):**
  ```bash
  bun lint
  ```
- **Format check (Prettier):**
  ```bash
  bun format:check
  ```
- **Format (Prettier):**
  ```bash
  bun format
  ```

Every browser-specific command also exists in explicit form (`dev:firefox`, `build:firefox`, `zip:firefox`) — the unsuffixed command is always Firefox.

### Editor Setup

Install the ESLint and Prettier extensions for your editor so it flags the same issues CI does:

- **ESLint extension** — integrates `eslint.config.js`, highlighting lint and deprecation errors inline
- **Prettier extension** — integrates the Prettier config; set it as the default formatter and enable **Format On Save** so files are always CI-clean

For example, in VS Code (`dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`):

```bash
code --install-extension dbaeumer.vscode-eslint --install-extension esbenp.prettier-vscode
```

and in workspace settings (`.vscode/settings.json`), so formatting on save uses Prettier:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

Every editor with an ESLint/Prettier integration (VS Code, WebStorm, Neovim, …) works the same way — point it at this repo's config and enable format-on-save.

### Production & Distribution

- **Build extension (Firefox — the default):**
  ```bash
  bun run build
  ```
- **Build extension (Chrome):**
  ```bash
  bun run build:chrome
  ```
- **Package Firefox zip (+ addons.mozilla.com sources zip):**
  ```bash
  bun zip
  ```
- **Package Chrome zip:**
  ```bash
  bun zip:chrome
  ```

## Contributors

BeamApply cannot be successful without the support of our contributors. Thank you to everyone who has helped shape this project!

We are always looking for passionate developers to help improve BeamApply. Contributions of all kinds are warmly welcome. Feel free to report any issues or submit a pull request.

<a href="https://github.com/ShubhamAvasthi/beam-apply/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ShubhamAvasthi/beam-apply" />
</a>
