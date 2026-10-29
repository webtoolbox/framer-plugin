# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.1.0] — Unreleased

### Added
- Initial plugin: forum URL / page / full-width inputs with live embed-URL preview.
- **Add to site** — injects the WT embed snippet via Framer `setCustomCode` (bodyEnd).
- **Copy code** — clipboard fallback with the WT admin-shaped snippet.
- `buildEmbedUrl`/`buildEmbedCode` pure builders byte-matched to Website-Toolbox
  `data/js/wt_global/embed.js` (`updateEmbedCode`) on origin/master, pinned by vitest suite.
