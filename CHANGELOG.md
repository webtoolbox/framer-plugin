# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.1.0] — Unreleased

### Changed
- Panel UI pass: grouped field spacing (a label now sits with its own control),
  the embed-URL preview moved into its own labelled surface instead of floating
  as bare text, and the installed-state message now says to publish the site to
  see the forum — Framer runs custom code on published pages only.

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
- **Signed-in embed** — after you sign in, the embed URL carries the forum's
  SSO sign-in token as `?authtoken=<token>` (the same parameter our
  Thinkific/Kajabi/Shopify embeds append), so the embedded forum renders signed
  in as you. The token is URL-borne because the embed runs in a third-party
  iframe (framer.com loading the forum's domain), where the session cookie is
  not sent. When the sign-in response carries no token — or nobody is signed in
  — the embed is byte-identical to before and renders a signed-out forum.
- **Sign in to Website Toolbox** — the plugin now signs the operator in to the
  forum's Website Toolbox account over OAuth: it opens the forum's sign-in page
  in the browser (Framer's sanctioned `window.open` flow — a plugin iframe has
  no `window.opener`), polls with a single-use read key for the tokens, and
  shows who is signed in. A cancelled, expired (10 minutes) or timed-out
  sign-in is reported with a retry.
- Initial plugin: forum URL / page / full-width inputs with live embed-URL preview.
- **Add to site** — injects the WT embed snippet via Framer `setCustomCode` (bodyEnd).
  Custom Code is gated behind a paid Framer plan, so a refused install falls back
  to copying the snippet to the clipboard and pointing at manual placement.
- **Copy code** — clipboard fallback with the WT admin-shaped snippet.
- `buildEmbedUrl`/`buildEmbedCode` pure builders byte-matched to Website-Toolbox
  `data/js/wt_global/embed.js` (`updateEmbedCode`) on origin/master, pinned by vitest suite.
