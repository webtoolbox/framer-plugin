import { framer, useIsAllowedTo } from "@framer/plugin"
import { useEffect, useMemo, useState } from "react"
import { buildEmbedCode, buildEmbedUrl } from "./lib/embedUrl.ts"
import { installEmbed } from "./lib/installEmbed.ts"
import {
  fetchUserinfo,
  resolveServerBase,
  signInToWebsiteToolbox,
  type Tokens,
} from "./lib/oauthSignIn.ts"
import "./App.css"

framer.showUI({
  position: "top right",
  width: 300,
  height: 360,
})

/** Where the signed-in session is remembered between panel opens. */
const SESSION_KEY = "wtbx.oauth.session"

interface StoredSession {
  tokens: Tokens
  serverBase: string
  name?: string
  email?: string
}

function loadSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.tokens &&
      typeof parsed.tokens.accessToken === "string"
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else window.localStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage unavailable — the session simply does not persist */
  }
}

type AuthState = {
  status: "signedOut" | "pending" | "signedIn" | "error"
  name?: string
  email?: string
  message?: string
}

export function App() {
  const [forumUrl, setForumUrl] = useState("")
  const [page, setPage] = useState("")
  const [fullWidth, setFullWidth] = useState(true)
  const [status, setStatus] = useState<
    { kind: "idle" | "ok" | "error"; message: string }>({ kind: "idle", message: "" }
  )
  const [auth, setAuth] = useState<AuthState>({ status: "signedOut" })

  const preview = useMemo(
    () => buildEmbedUrl({ forumUrl, page, fullWidth }),
    [forumUrl, page, fullWidth],
  )
  // The authorization server's issuer is the forum itself, so the server base
  // is the forum address's origin.
  const serverBase = useMemo(() => resolveServerBase(forumUrl), [forumUrl])
  // Live validation: show WHY the preview/buttons are unavailable while typing
  // (otherwise invalid input just silently hides the preview — no feedback).
  const liveError = !preview.ok && forumUrl.trim() !== "" ? preview.error : null
  // setCustomCode is a protected method: Framer's own flow is to gate the
  // control on the permission rather than call it optimistically.
  const canInstall = useIsAllowedTo("setCustomCode")

  // Restore a previous sign-in and refresh the displayed identity once.
  useEffect(() => {
    const session = loadSession()
    if (!session) return
    setAuth({ status: "signedIn", name: session.name, email: session.email })
    let cancelled = false
    void fetchUserinfo({
      serverBase: session.serverBase,
      accessToken: session.tokens.accessToken,
    }).then((identity) => {
      if (cancelled || !identity) return
      setAuth({ status: "signedIn", name: identity.name, email: identity.email })
      saveSession({ ...session, name: identity.name, email: identity.email })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSignIn = async () => {
    if (!serverBase) {
      setAuth({ status: "error", message: "Enter your forum URL first." })
      return
    }
    setAuth({ status: "pending" })
    const outcome = await signInToWebsiteToolbox({
      serverBase,
      // Framer's sanctioned way for a plugin to open an external URL: the
      // sign-in page opens in the user's real browser (window.open), because a
      // plugin iframe has no window.opener to receive tokens by postMessage.
      openUrl: (url) => {
        window.open(url, "_blank")
      },
    })
    if (outcome.status === "signedIn") {
      setAuth({ status: "signedIn", name: outcome.identity?.name, email: outcome.identity?.email })
      saveSession({
        tokens: outcome.tokens,
        serverBase,
        name: outcome.identity?.name,
        email: outcome.identity?.email,
      })
      return
    }
    if (outcome.status === "denied") {
      setAuth({ status: "error", message: "Sign-in was cancelled (access denied)." })
      return
    }
    if (outcome.status === "expired") {
      setAuth({
        status: "error",
        message: "The sign-in request expired (10 minutes). Please try again.",
      })
      return
    }
    if (outcome.status === "timeout") {
      setAuth({
        status: "error",
        message: "Timed out waiting for the sign-in to finish. Please try again.",
      })
      return
    }
    setAuth({ status: "error", message: outcome.message })
  }

  const handleSignOut = () => {
    saveSession(null)
    setAuth({ status: "signedOut" })
  }

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
        message:
          "Forum embed added to your site's custom code (body end). " +
          "Publish your site to see the forum — custom code runs on the " +
          "published pages.",
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
          `Couldn't add it to the site automatically (${result.reason}), and ` +
          "the clipboard is unavailable too. Copy the embed code from your " +
          "forum's admin Embed page and paste it into an Embed element.",
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
      <div className="wtbx-field">
        <label htmlFor="wtx-forum-url">Forum URL</label>
        <input
          id="wtx-forum-url"
          type="url"
          placeholder="https://acme.websitetoolbox.com"
          value={forumUrl}
          onChange={(e) => setForumUrl(e.target.value)}
        />
      </div>

      <div className="wtbx-field">
        <label htmlFor="wtx-page">
          Page <span className="wtbx-hint">(optional)</span>
        </label>
        <input
          id="wtx-page"
          type="text"
          placeholder="topic/123"
          value={page}
          onChange={(e) => setPage(e.target.value)}
        />
      </div>

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
        <div className="wtbx-field">
          <span className="wtbx-preview-label" id="wtx-embed-url-label">
            Embed URL
          </span>
          <code
            className="wtbx-preview"
            aria-labelledby="wtx-embed-url-label"
            title={preview.embedUrl}
          >
            {preview.embedUrl}
          </code>
        </div>
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

      <div className="wtbx-field">
        <span className="wtbx-preview-label">Website Toolbox account</span>
        {auth.status === "pending" && (
          <p className="wtbx-note" role="status">
            Waiting for you to sign in — a browser tab has opened. Approve the
            request there, then come back to this panel.
          </p>
        )}
        {auth.status === "signedIn" && (
          <div className="wtbx-field">
            <p className="wtbx-status-ok">
              {auth.name ? `Signed in as ${auth.name}` : "Signed in to Website Toolbox"}
              {auth.email ? ` (${auth.email})` : ""}.
            </p>
            <button onClick={handleSignOut}>Sign out</button>
          </div>
        )}
        {auth.status === "error" && (
          <p className="wtbx-status-error">{auth.message}</p>
        )}
        {(auth.status === "signedOut" || auth.status === "error") && (
          <button
            onClick={handleSignIn}
            disabled={!serverBase}
            title={serverBase ? undefined : "Enter your forum URL first."}
          >
            {auth.status === "error"
              ? "Try signing in again"
              : "Sign in to Website Toolbox"}
          </button>
        )}
      </div>
    </main>
  )
}
