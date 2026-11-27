/**
 * Website Toolbox plugin sign-in (OAuth).
 *
 * The Framer plugin authenticates the OPERATOR's Website Toolbox account
 * against the forum's own authorization server. Framer runs a plugin in an
 * iframe and its OAuth guide opens the sign-in page with `window.open` in the
 * user's system browser, so the tokens can never come back through
 * `window.opener.postMessage` — the sanctioned flow is backend-mediated and
 * POLLED:
 *
 *   1. POST /oauth/plugin/authorize -> { url, read_key, expires_in }
 *   2. open `url` in the browser (the caller supplies the opener: window.open)
 *   3. GET  /oauth/plugin/poll?read_key=... until the tokens arrive, then once
 *   4. GET  /oauth/userinfo            -> who is signed in
 *
 * Source of truth for the wire contract: Custom::MB::OAuthServer::Plugin (read
 * from the server source, not guessed). This module holds NO client secret —
 * the plugin is a public PKCE client, the read key is single-use and short
 * lived (600 s), and it is never stored or logged here.
 */

/** The public PKCE client this plugin is registered as on the forum's AS. */
export const PLUGIN_CLIENT_ID = "d3e56c0a26dc29f897d553ea0b64e12a"
/** Scopes the plugin requests: identity + public profile. */
export const PLUGIN_SCOPES = "openid profile:read"

const AUTHORIZE_PATH = "/oauth/plugin/authorize"
const POLL_PATH = "/oauth/plugin/poll"
const USERINFO_PATH = "/oauth/userinfo"

export interface Tokens {
  accessToken: string
  refreshToken: string | null
  expiresIn: number | null
  /**
   * The forum's SSO sign-in token for the same member, when the sign-in
   * response carries one. This is the token the embedded forum signs in from
   * (`?authtoken=`); it is an `sso_auth_tokens` row minted by the forum, not the
   * OAuth access token. Null when the server does not provide it.
   */
  authToken: string | null
}

export interface Identity {
  sub?: string
  name?: string
  email?: string
}

export type OpenSignInOutcome =
  | { status: "started"; url: string; readKey: string; expiresIn: number }
  | { status: "error"; message: string }

export type PollOutcome =
  | { status: "completed"; tokens: Tokens }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "timeout" }
  | { status: "error"; message: string }

export type SignInOutcome =
  | { status: "signedIn"; tokens: Tokens; identity: Identity | null }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "timeout" }
  | { status: "error"; message: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const rec = asRecord(await res.json())
    const desc = rec?.error_description
    if (typeof desc === "string" && desc) return `: ${desc}`
  } catch {
    /* not JSON — fall through to a bare status */
  }
  return ""
}

/**
 * Resolve a forum address to the origin of its authorization server. The AS
 * issuer is the forum itself (per its discovery document), so the server base
 * is the forum address's scheme://host.
 */
export function resolveServerBase(forumUrl: string): string | null {
  const trimmed = forumUrl.trim()
  if (!trimmed) return null
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i)
  if (scheme && !/^https?$/i.test(scheme[1])) return null
  const withProto = scheme ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProto)
    return url.origin
  } catch {
    return null
  }
}

export interface AuthorizeOptions {
  serverBase: string
  clientId?: string
  scope?: string
  fetchImpl?: typeof fetch
}

/** Step 1 — ask the AS for a sign-in URL plus a one-time read key. */
export async function startPluginAuthorize(
  options: AuthorizeOptions,
): Promise<OpenSignInOutcome> {
  const {
    serverBase,
    clientId = PLUGIN_CLIENT_ID,
    scope = PLUGIN_SCOPES,
    fetchImpl = fetch,
  } = options

  let res: Response
  try {
    res = await fetchImpl(serverBase + AUTHORIZE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, scope }).toString(),
    })
  } catch (error) {
    return {
      status: "error",
      message: `Couldn't reach the forum's sign-in server (${describeError(error)}).`,
    }
  }
  if (!res.ok) {
    return {
      status: "error",
      message: `Sign-in couldn't start (HTTP ${res.status}${await errorDetail(res)}).`,
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { status: "error", message: "Sign-in returned an unexpected (non-JSON) response." }
  }
  const rec = asRecord(body)
  const url = rec?.url
  const readKey = rec?.read_key
  const expiresIn = rec?.expires_in
  if (typeof url !== "string" || typeof readKey !== "string" || typeof expiresIn !== "number") {
    return { status: "error", message: "Sign-in returned an unexpected response shape." }
  }
  return { status: "started", url, readKey, expiresIn }
}

export interface PollOptions {
  serverBase: string
  readKey: string
  /** Hard stop for the poll loop; defaults to the pending-session lifetime. */
  timeoutMs?: number
  pollIntervalMs?: number
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
  nowImpl?: () => number
  /** Called on every `pending` answer (e.g. to keep the panel's state fresh). */
  onPending?: () => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function readTokens(rec: Record<string, unknown>): Tokens | null {
  const accessToken = rec.access_token
  if (typeof accessToken !== "string" || accessToken === "") return null
  return {
    accessToken,
    refreshToken: typeof rec.refresh_token === "string" ? rec.refresh_token : null,
    expiresIn: typeof rec.expires_in === "number" ? rec.expires_in : null,
    authToken: typeof rec.authtoken === "string" && rec.authtoken ? rec.authtoken : null,
  }
}

/**
 * Step 3 — poll with the read key. `pending` keeps polling; `completed`
 * releases the tokens exactly once; `denied`/`expired` are terminal; a poll
 * that never resolves before the deadline is a client-side `timeout`.
 */
export async function pollPluginTokens(options: PollOptions): Promise<PollOutcome> {
  const {
    serverBase,
    readKey,
    timeoutMs = 600_000,
    pollIntervalMs = 2_500,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    nowImpl = Date.now,
    onPending,
  } = options

  const deadline = nowImpl() + timeoutMs
  for (;;) {
    if (nowImpl() >= deadline) return { status: "timeout" }

    let res: Response
    try {
      res = await fetchImpl(
        `${serverBase}${POLL_PATH}?read_key=${encodeURIComponent(readKey)}`,
        { method: "GET" },
      )
    } catch (error) {
      return { status: "error", message: `Checking the sign-in failed (${describeError(error)}).` }
    }
    if (!res.ok) {
      return { status: "error", message: `Checking the sign-in failed (HTTP ${res.status}).` }
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      return { status: "error", message: "Checking the sign-in returned a non-JSON response." }
    }
    const rec = asRecord(body)
    const status = rec?.status

    if (status === "completed") {
      const tokens = rec ? readTokens(rec) : null
      if (!tokens) {
        return { status: "error", message: "Sign-in completed but the token response was malformed." }
      }
      return { status: "completed", tokens }
    }
    if (status === "denied") return { status: "denied" }
    if (status === "expired") return { status: "expired" }
    if (status === "pending") {
      onPending?.()
      if (nowImpl() + pollIntervalMs >= deadline) return { status: "timeout" }
      await sleepImpl(pollIntervalMs)
      continue
    }
    return {
      status: "error",
      message: `Sign-in returned an unexpected status ("${String(status)}").`,
    }
  }
}

export interface UserinfoOptions {
  serverBase: string
  accessToken: string
  fetchImpl?: typeof fetch
}

/**
 * Step 4 — resolve who is signed in. Best effort: a forum that does not allow
 * this origin to read userinfo (or an expired token) yields null, and the
 * caller still reports the signed-in state.
 */
export async function fetchUserinfo(options: UserinfoOptions): Promise<Identity | null> {
  const { serverBase, accessToken, fetchImpl = fetch } = options
  let res: Response
  try {
    res = await fetchImpl(serverBase + USERINFO_PATH, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  try {
    const rec = asRecord(await res.json())
    if (!rec) return null
    return {
      sub: typeof rec.sub === "string" ? rec.sub : undefined,
      name: typeof rec.name === "string" ? rec.name : undefined,
      email: typeof rec.email === "string" ? rec.email : undefined,
    }
  } catch {
    return null
  }
}

export interface SignInOptions {
  serverBase: string
  clientId?: string
  scope?: string
  /** The sanctioned browser opener (window.open in the plugin panel). */
  openUrl: (url: string) => void
  timeoutMs?: number
  pollIntervalMs?: number
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
  nowImpl?: () => number
  onPending?: () => void
}

/** The whole flow: authorize -> open the browser -> poll -> identify. */
export async function signInToWebsiteToolbox(options: SignInOptions): Promise<SignInOutcome> {
  const started = await startPluginAuthorize({
    serverBase: options.serverBase,
    clientId: options.clientId,
    scope: options.scope,
    fetchImpl: options.fetchImpl,
  })
  if (started.status === "error") return started

  options.openUrl(started.url)

  const polled = await pollPluginTokens({
    serverBase: options.serverBase,
    readKey: started.readKey,
    timeoutMs: options.timeoutMs ?? started.expiresIn * 1000,
    pollIntervalMs: options.pollIntervalMs,
    fetchImpl: options.fetchImpl,
    sleepImpl: options.sleepImpl,
    nowImpl: options.nowImpl,
    onPending: options.onPending,
  })
  if (polled.status !== "completed") return polled

  const identity = await fetchUserinfo({
    serverBase: options.serverBase,
    accessToken: polled.tokens.accessToken,
    fetchImpl: options.fetchImpl,
  })
  return { status: "signedIn", tokens: polled.tokens, identity }
}
