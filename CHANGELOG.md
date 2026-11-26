# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.1.0] — Unreleased

### Fixed
- A malformed `%`-escape in the **Page** field (e.g. `page?p=%`) no longer
  throws — it reports an invalid-escape error instead of blanking the panel.
- **Add to site** is disabled when the account cannot install Custom Code, with
  a note pointing at **Copy code**, instead of failing after the click.
- The optional-field hint met neither WCAG AA nor the panel's contrast (opacity
  0.6 → 0.8).
- `vite-plugin-mkcert` removed from the dependencies — nothing imported it after
  the dev server moved to `vite-plugin-framer`.

### Added
- Initial plugin: forum URL / page / full-width inputs with live embed-URL preview.
- **Add to site** — injects the WT embed snippet via Framer `setCustomCode` (bodyEnd).
  Custom Code is gated behind a paid Framer plan, so a refused install falls back
  to copying the snippet to the clipboard and pointing at manual placement.
- **Copy code** — clipboard fallback with the WT admin-shaped snippet.
- `buildEmbedUrl`/`buildEmbedCode` pure builders byte-matched to Website-Toolbox
  `data/js/wt_global/embed.js` (`updateEmbedCode`) on origin/master, pinned by vitest suite.
