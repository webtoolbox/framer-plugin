# Website Toolbox Forum — Framer Plugin

Official [Website Toolbox](https://www.websitetoolbox.com) plugin for Framer.
Adds your embedded forum to a Framer site in two clicks — no manual code pasting.

## What it does

- **Add to site** — generates the exact WT admin embed snippet and injects it
  into the published site's custom code (`bodyEnd`), using Framer's official
  `setCustomCode` plugin API.
- **Copy code** — copies the same snippet to the clipboard for manual placement
  (e.g. inside an Embed component on a specific page).
- Inputs: **Forum URL** (required), **Page** (optional — a forum page to open),
  **Full width** (toggle → `?fullwidth=0`).

The generated URL/snippet is a **byte-match of the WT admin "Embed" page logic**
(`data/js/wt_global/embed.js` → `updateEmbedCode()` on the Website-Toolbox repo's
`origin/master`), pinned by unit tests in `src/lib/embedUrl.test.ts`.

## Development

```bash
npm install
npm run dev        # live-reload; open in Framer via Plugins → Open Development Plugin
npm test           # vitest — embed-URL byte-match suite
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # tsc --noEmit
```

> Note: `npm run dev` uses `vite-plugin-mkcert` (local HTTPS cert for the
> Framer editor bridge). Ad-blockers (Brave etc.) may block localhost —
> allow-list framer.com if the plugin doesn't open.

## Release

```bash
npm run pack       # → plugin.zip
```

Upload `plugin.zip` at the [Marketplace dashboard](https://framer.com/marketplace/dashboard/plugins/)
(“New Plugin”). Version bumps follow semver; record changes in `CHANGELOG.md`.

## Structure

| Path | Role |
|---|---|
| `src/lib/embedUrl.ts` | Pure embed-URL/snippet builder (no DOM) — single source of truth |
| `src/lib/embedUrl.test.ts` | Byte-match tests vs WT master rules |
| `src/App.tsx` | Plugin UI (React) — inputs, preview, Add to site / Copy |
| `framer.json` | Plugin manifest (name, icon, canvas mode) |
