import { describe, expect, it, vi } from "vitest"
import {
  fetchUserinfo,
  pollPluginTokens,
  resolveServerBase,
  signInToWebsiteToolbox,
  startPluginAuthorize,
  type Tokens,
} from "./oauthSignIn.ts"

const BASE = "https://beta41.websitetoolbox.com"

/** Minimal Response stand-in — the module only reads ok/status/json(). */
function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response
}

function malformedResponse(init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON")
    },
  } as unknown as Response
}

/** Route a fake fetch by URL substring so one impl can serve a whole flow. */
function routeFetch(
  handler: (url: string, init?: RequestInit) => Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    return handler(url, init)
  }) as typeof fetch
}

const AUTHORIZE_OK = { url: "https://beta41.websitetoolbox.com/oauth/authorize?x=1", read_key: "a".repeat(64), expires_in: 600 }

describe("resolveServerBase — the AS issuer is the forum itself", () => {
  it("reduces a forum URL to its origin", () => {
    expect(resolveServerBase("https://beta41.websitetoolbox.com/some/page")).toBe(BASE)
  })
  it("adds a missing scheme", () => {
    expect(resolveServerBase("beta41.websitetoolbox.com")).toBe(BASE)
  })
  it("rejects empty and non-http input", () => {
    expect(resolveServerBase("   ")).toBeNull()
    expect(resolveServerBase("ftp://files.example.com")).toBeNull()
  })
})

describe("startPluginAuthorize — POST /oauth/plugin/authorize", () => {
  it("returns the sign-in URL, read key and lifetime", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(AUTHORIZE_OK))
    const r = await startPluginAuthorize({ serverBase: BASE, fetchImpl })
    expect(r).toEqual({
      status: "started",
      url: AUTHORIZE_OK.url,
      readKey: AUTHORIZE_OK.read_key,
      expiresIn: 600,
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/oauth/plugin/authorize`)
    expect(init.method).toBe("POST")
    expect(String(init.body)).toContain("client_id=")
    expect(String(init.body)).toContain("scope=openid")
  })

  it("reports a refusal (non-200) with the server's description", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: "invalid_scope", error_description: 'The scope "x" is not allowed.' },
        { ok: false, status: 400 },
      ),
    )
    const r = await startPluginAuthorize({ serverBase: BASE, fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toContain("is not allowed")
  })

  it("reports a malformed (non-JSON) response rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(malformedResponse())
    const r = await startPluginAuthorize({ serverBase: BASE, fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toMatch(/non-JSON/)
  })

  it("reports an unexpected response shape (missing fields)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ url: "https://x" }))
    const r = await startPluginAuthorize({ serverBase: BASE, fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toMatch(/shape/)
  })

  it("reports a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    const r = await startPluginAuthorize({ serverBase: BASE, fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toContain("Failed to fetch")
  })
})

/** Wire tokens (RFC field names) and the parsed result the module must yield. */
const WIRE_TOKENS = { access_token: "at-123", refresh_token: "rt-456", expires_in: 3600 }
const TOKENS: Tokens = {
  accessToken: "at-123",
  refreshToken: "rt-456",
  expiresIn: 3600,
  authToken: null,
}

describe("pollPluginTokens — GET /oauth/plugin/poll", () => {
  it("keeps polling through 'pending' and returns tokens once 'completed'", async () => {
    const seq = ["pending", "pending", "completed"]
    let i = 0
    const fetchImpl = vi.fn().mockImplementation(() => {
      const status = seq[i++]
      return Promise.resolve(
        status === "completed"
          ? jsonResponse({ status, token_type: "Bearer", ...WIRE_TOKENS })
          : jsonResponse({ status }),
      )
    })
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k".repeat(64), fetchImpl, sleepImpl })
    expect(r).toEqual({ status: "completed", tokens: TOKENS })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/oauth/plugin/poll?read_key=${"k".repeat(64)}`)
  })

  it("maps a 'denied' answer (user cancelled consent)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "denied" }))
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    expect(r).toEqual({ status: "denied" })
  })

  it("carries the forum's SSO sign-in token when the response includes one", async () => {
    // The forum mints an `sso_auth_tokens` row for the member and returns it as
    // `authtoken`; the plugin feeds it into the embed URL so the frame is signed
    // in. It is NOT the OAuth access token.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ status: "completed", token_type: "Bearer", ...WIRE_TOKENS, authtoken: "sso-token-abc" }),
    )
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    expect(r).toEqual({ status: "completed", tokens: { ...TOKENS, authToken: "sso-token-abc" } })
  })

  it("leaves the SSO token null when the response omits it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "completed", ...WIRE_TOKENS }))
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    if (r.status === "completed") expect(r.tokens.authToken).toBeNull()
  })

  it("maps a server 'expired' answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "expired" }))
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    expect(r).toEqual({ status: "expired" })
  })

  it("times out client-side when the session never completes", async () => {
    let clock = 0
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "pending" }))
    const r = await pollPluginTokens({
      serverBase: BASE,
      readKey: "k",
      fetchImpl,
      timeoutMs: 5_000,
      pollIntervalMs: 2_500,
      nowImpl: () => clock,
      sleepImpl: async (ms: number) => {
        clock += ms
      },
    })
    expect(r).toEqual({ status: "timeout" })
  })

  it("reports a malformed 'completed' payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "completed" }))
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toMatch(/malformed/)
  })

  it("reports an unexpected status value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "banana" }))
    const r = await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl })
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toContain("banana")
  })

  it("reports an HTTP error and a non-JSON body", async () => {
    const bad = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))
    expect((await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl: bad })).status).toBe("error")
    const garbled = vi.fn().mockResolvedValue(malformedResponse())
    expect((await pollPluginTokens({ serverBase: BASE, readKey: "k", fetchImpl: garbled })).status).toBe("error")
  })
})

describe("fetchUserinfo — GET /oauth/userinfo", () => {
  it("returns the identity claims", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ sub: "1743:9", name: "QA OAuth User", email: "qa@example.com" }),
    )
    const id = await fetchUserinfo({ serverBase: BASE, accessToken: "at", fetchImpl })
    expect(id).toEqual({ sub: "1743:9", name: "QA OAuth User", email: "qa@example.com" })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/oauth/userinfo`)
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
  })

  it("returns null rather than throwing when userinfo is unreadable", async () => {
    const unauth = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }))
    expect(await fetchUserinfo({ serverBase: BASE, accessToken: "at", fetchImpl: unauth })).toBeNull()
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    expect(await fetchUserinfo({ serverBase: BASE, accessToken: "at", fetchImpl: offline })).toBeNull()
  })
})

describe("signInToWebsiteToolbox — the whole flow", () => {
  it("opens the sign-in URL in the browser, polls, and identifies the user", async () => {
    const openUrl = vi.fn()
    const fetchImpl = routeFetch((url) => {
      if (url.endsWith("/oauth/plugin/authorize")) return jsonResponse(AUTHORIZE_OK)
      if (url.includes("/oauth/plugin/poll")) return jsonResponse({ status: "completed", token_type: "Bearer", ...WIRE_TOKENS })
      if (url.endsWith("/oauth/userinfo")) return jsonResponse({ sub: "1743:9", name: "QA OAuth User", email: "qa@example.com" })
      throw new Error("unexpected url " + url)
    })
    const r = await signInToWebsiteToolbox({ serverBase: BASE, openUrl, fetchImpl })
    expect(openUrl).toHaveBeenCalledWith(AUTHORIZE_OK.url)
    expect(r).toEqual({
      status: "signedIn",
      tokens: TOKENS,
      identity: { sub: "1743:9", name: "QA OAuth User", email: "qa@example.com" },
    })
  })

  it("still signs in when userinfo cannot be read (identity is best-effort)", async () => {
    const fetchImpl = routeFetch((url) => {
      if (url.endsWith("/oauth/plugin/authorize")) return jsonResponse(AUTHORIZE_OK)
      if (url.includes("/oauth/plugin/poll")) return jsonResponse({ status: "completed", ...WIRE_TOKENS })
      return jsonResponse({}, { ok: false, status: 403 })
    })
    const r = await signInToWebsiteToolbox({ serverBase: BASE, openUrl: vi.fn(), fetchImpl })
    expect(r.status).toBe("signedIn")
    if (r.status === "signedIn") expect(r.identity).toBeNull()
  })

  it("propagates a denial without calling userinfo", async () => {
    const userinfo = vi.fn()
    const fetchImpl = routeFetch((url) => {
      if (url.endsWith("/oauth/plugin/authorize")) return jsonResponse(AUTHORIZE_OK)
      if (url.includes("/oauth/plugin/poll")) return jsonResponse({ status: "denied" })
      userinfo()
      return jsonResponse({})
    })
    const r = await signInToWebsiteToolbox({ serverBase: BASE, openUrl: vi.fn(), fetchImpl })
    expect(r).toEqual({ status: "denied" })
    expect(userinfo).not.toHaveBeenCalled()
  })

  it("stops before opening a browser when authorize fails", async () => {
    const openUrl = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 400 }))
    const r = await signInToWebsiteToolbox({ serverBase: BASE, openUrl, fetchImpl })
    expect(r.status).toBe("error")
    expect(openUrl).not.toHaveBeenCalled()
  })
})
