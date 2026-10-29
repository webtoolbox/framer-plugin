import { framer } from "@framer/plugin"
import { useMemo, useState } from "react"
import { buildEmbedCode, buildEmbedUrl } from "./lib/embedUrl.ts"
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

  const handleAddToSite = async () => {
    const built = buildEmbedCode({ forumUrl, page, fullWidth })
    if (!built.ok) {
      setStatus({ kind: "error", message: built.error })
      return
    }
    try {
      // WT admin's embed snippet is a site-level <script>; Framer's official
      // slot for site-wide HTML is custom code — inject at bodyEnd so the
      // embed script runs after the page content exists.
      await framer.setCustomCode({ html: built.code, location: "bodyEnd" })
      setStatus({
        kind: "ok",
        message: "Forum embed added to your site's custom code (body end).",
      })
    } catch (e) {
      setStatus({
        kind: "error",
        message: `Could not add custom code: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  const handleCopy = async () => {
    const built = buildEmbedCode({ forumUrl, page, fullWidth })
    if (!built.ok) {
      setStatus({ kind: "error", message: built.error })
      return
    }
    await navigator.clipboard.writeText(built.code)
    setStatus({ kind: "ok", message: "Embed code copied to clipboard." })
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

      {preview.ok && (
        <code className="wtbx-preview" title={preview.embedUrl}>
          {preview.embedUrl}
        </code>
      )}

      <div className="wtbx-actions">
        <button
          className="framer-button-primary"
          onClick={handleAddToSite}
          disabled={!preview.ok}
        >
          Add to site
        </button>
        <button onClick={handleCopy} disabled={!preview.ok}>
          Copy code
        </button>
      </div>

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
