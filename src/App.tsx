import { framer, useIsAllowedTo } from "@framer/plugin"
import { useMemo, useState } from "react"
import { buildEmbedCode, buildEmbedUrl } from "./lib/embedUrl.ts"
import { installEmbed } from "./lib/installEmbed.ts"
import "./App.css"

framer.showUI({
  position: "top right",
  width: 300,
  height: 360,
})

export function App() {
  const [forumUrl, setForumUrl] = useState("")
  const [page, setPage] = useState("")
  const [fullWidth, setFullWidth] = useState(true)
  const [status, setStatus] = useState<
    { kind: "idle" | "ok" | "error"; message: string }>({ kind: "idle", message: "" }
  )

  const preview = useMemo(
    () => buildEmbedUrl({ forumUrl, page, fullWidth }),
    [forumUrl, page, fullWidth],
  )
  // Live validation: show WHY the preview/buttons are unavailable while typing
  // (otherwise invalid input just silently hides the preview — no feedback).
  const liveError = !preview.ok && forumUrl.trim() !== "" ? preview.error : null
  // setCustomCode is a protected method: Framer's own flow is to gate the
  // control on the permission rather than call it optimistically.
  const canInstall = useIsAllowedTo("setCustomCode")

  const handleAddToSite = async () => {
    const built = buildEmbedCode({ forumUrl, page, fullWidth })
    if (!built.ok) {
      setStatus({ kind: "error", message: built.error })
      return
    }
    // WT admin's embed snippet is a site-level <script>; Framer's official
    // slot for site-wide HTML is custom code — inject at bodyEnd so the embed
    // script runs after the page content exists. Framer gates Custom Code
    // behind a paid plan (and a limited collaborator can be refused outright),
    // so a refusal falls back to the clipboard instead of dead-ending.
    const result = await installEmbed(
      built.code,
      (code) => framer.setCustomCode({ html: code, location: "bodyEnd" }),
      (code) => navigator.clipboard.writeText(code),
    )
    if (result.status === "installed") {
      setStatus({
        kind: "ok",
        message: "Forum embed added to your site's custom code (body end).",
      })
    } else if (result.status === "copied") {
      setStatus({
        kind: "error",
        message:
          `Couldn't add it to the site automatically (${result.reason}). ` +
          "The embed code is on your clipboard — paste it into an Embed " +
          "element on the page instead.",
      })
    } else {
      setStatus({
        kind: "error",
        message:
          `Couldn't add it to the site automatically (${result.reason}). ` +
          'Use "Copy code" and paste it into an Embed element on the page.',
      })
    }
  }

  const handleCopy = async () => {
    const built = buildEmbedCode({ forumUrl, page, fullWidth })
    if (!built.ok) {
      setStatus({ kind: "error", message: built.error })
      return
    }
    try {
      await navigator.clipboard.writeText(built.code)
      setStatus({ kind: "ok", message: "Embed code copied to clipboard." })
    } catch (e) {
      setStatus({
        kind: "error",
        message: `Couldn't copy to the clipboard: ${
          e instanceof Error ? e.message : String(e)
        }.`,
      })
    }
  }

  return (
    <main className="wtbx-plugin">
      <h1>Website Toolbox Forum</h1>

      <label htmlFor="wtx-forum-url">Forum URL</label>
      <input
        id="wtx-forum-url"
        type="url"
        placeholder="https://acme.websitetoolbox.com"
        value={forumUrl}
        onChange={(e) => setForumUrl(e.target.value)}
      />

      <label htmlFor="wtx-page">
        Page <span className="wtbx-hint">(optional — forum page to open)</span>
      </label>
      <input
        id="wtx-page"
        type="text"
        placeholder="topic/123"
        value={page}
        onChange={(e) => setPage(e.target.value)}
      />

      <label className="wtbx-checkbox">
        <input
          type="checkbox"
          checked={fullWidth}
          onChange={(e) => setFullWidth(e.target.checked)}
        />
        Full width
      </label>

      {liveError && <p className="wtbx-status-error">{liveError}</p>}

      {preview.ok && (
        <code className="wtbx-preview" title={preview.embedUrl}>
          {preview.embedUrl}
        </code>
      )}

      <div className="wtbx-actions">
        <button
          className="framer-button-primary"
          onClick={handleAddToSite}
          disabled={!preview.ok || !canInstall}
          title={
            canInstall
              ? undefined
              : "Automatic install isn't available for this account — use Copy code."
          }
        >
          Add to site
        </button>
        <button onClick={handleCopy} disabled={!preview.ok}>
          Copy code
        </button>
      </div>

      {preview.ok && !canInstall && (
        <p className="wtbx-note">
          Automatic install isn't available for this account (Custom Code needs
          a paid Framer plan or edit permission) — use <b>Copy code</b> and
          paste it into an Embed element.
        </p>
      )}

      {status.kind !== "idle" && (
        <p
          className={
            status.kind === "error" ? "wtbx-status-error" : "wtbx-status-ok"
          }
        >
          {status.message}
        </p>
      )}
    </main>
  )
}
