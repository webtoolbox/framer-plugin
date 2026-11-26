# Website Toolbox Forum — Framer Plugin

Official [Website Toolbox](https://www.websitetoolbox.com) plugin for Framer.
Adds your embedded forum to a Framer site in two clicks — no manual code pasting.

## What it does

- **Add to site** — generates a WT-admin-shaped embed snippet and injects it
  into the published site's custom code (`bodyEnd`), using Framer's official
  `setCustomCode` plugin API. Custom Code is gated behind a paid Framer plan, so
  when the install is refused the snippet is copied to the clipboard instead and
  the panel says to paste it into an Embed element.
- **Copy code** — copies the same snippet to the clipboard for manual placement
  (e.g. inside an Embed component on a specific page).
- Inputs: **Forum URL** (required), **Page** (optional — a forum page to open),
  **Full width** (toggle → `?fullwidth=0`).

The generated URL is a **byte-match of the WT admin "Embed" page logic**
(`data/js/wt_global/embed.js` → `updateEmbedCode()` on the Website-Toolbox repo's
`origin/master`), and the snippet reproduces the admin snippet's shape
(`cgi-bin/members/mb/embed`). Both are pinned by the unit tests in
`src/lib/embedUrl.test.ts`.

## Development

```bash
npm install
npm run dev        # live-reload; open in Framer via Plugins → Open Development Plugin
npm test           # vitest — embed-URL byte-match suite
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # tsc --noEmit
```

> Note: `npm run dev` serves the plugin on `http://localhost:5173` — plain HTTP,
> because `localhost` is a secure origin, so the Framer editor can embed it
> without a certificate (that is why the template's `vite-plugin-mkcert` was
> dropped). Two things can still block the editor from reaching it: an ad-blocker
> (Brave etc.) may block localhost — allow-list framer.com — and Chrome may raise
> a **Local Network Access** prompt for a public site reaching localhost, which
> must be allowed; without it the editor's fetch fails silently and no plugin
> appears.

## Testing inside Framer

The panel only runs inside the Framer editor, so the local dev server is opened
from there:

1. `npm run dev` — serves `http://localhost:5173`.
2. In Framer, open a project → **Plugins → Show developer tools**, then
   **Plugins → Open Development Plugin** (<https://framer.com/plugins/open>).
   The dialog **pre-fills `https://localhost:5173`** — change it to
   `http://localhost:5173`, because this dev server is plain HTTP. Left
   pre-filled, it fails silently and no panel appears.
3. The panel appears in the editor; publish the site to see the installed embed
   on the published pages.

**Add to site** installs the snippet as Custom Code (body end). Custom Code is a
paid-plan feature in Framer, so if the call is refused — the account lacks the
permission, or its plan does not cover Custom Code — the plugin copies the
snippet to the clipboard instead, for placement in an Embed element.

## Known limitations

- A forum with the `alt_embed_param` setting gets a different snippet from the
  Website Toolbox admin — a `data-version="1.1"` marker and `?wtp=` page params.
  The plugin always builds the default `?p=` form, because that setting cannot be
  read from the forum URL.

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
| `src/lib/installEmbed.ts` | Add to site → clipboard fallback decision |
| `src/App.tsx` | Plugin UI (React) — inputs, preview, Add to site / Copy |
| `framer.json` | Plugin manifest (name, icon, canvas mode) |
