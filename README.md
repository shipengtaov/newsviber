# News Viber

News Viber is a desktop news reader built with Tauri, React, and TypeScript using Vite.

## App Updates

News Viber uses the Tauri updater with GitHub Releases as the update source. The app checks:

- `https://github.com/shipengtaov/newsviber/releases/latest/download/latest.json`

The updater public key is committed in `src-tauri/tauri.conf.json`. The matching private key must stay outside the repo. The current local key path is `~/.tauri/newsviber.key`.

## Release Workflow

GitHub Actions publishes signed updater artifacts from `.github/workflows/release.yml`. Before pushing a release tag, configure these repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of your updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password used to protect your updater private key

Release tags must match the app version using the `v<version>` format. Example:

- `package.json`: `26.3.0`
- `src-tauri/tauri.conf.json`: `26.3.0`
- Git tag: `v26.3.0`

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
