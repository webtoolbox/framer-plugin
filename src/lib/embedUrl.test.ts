import { describe, expect, it } from "vitest"
import { buildEmbedCode, buildEmbedUrl } from "./embedUrl.ts"

const FORUM = "https://acme.websitetoolbox.com"

describe("buildEmbedUrl — WT master updateEmbedCode() byte-match rules", () => {
  it("base rule: <forum>/js/mb/embed.js, no page, full width default", () => {
    const r = buildEmbedUrl({ forumUrl: FORUM })
    expect(r).toEqual({
      ok: true,
      embedUrl: `${FORUM}/js/mb/embed.js`,
      pageParam: null,
    })
  })

  it("normalizes: trailing slashes stripped, missing protocol added", () => {
    const a = buildEmbedUrl({ forumUrl: "https://acme.websitetoolbox.com///" })
    const b = buildEmbedUrl({ forumUrl: "acme.websitetoolbox.com" })
    expect(a.ok && a.embedUrl).toBe(`${FORUM}/js/mb/embed.js`)
    expect(b.ok && b.embedUrl).toBe(`${FORUM}/js/mb/embed.js`)
  })

  it("page rule: bare path → leading slash + hash", () => {
    const r = buildEmbedUrl({ forumUrl: FORUM, page: "topic/123" })
    expect(r.ok && r.embedUrl).toBe(`${FORUM}/js/mb/embed.js#/topic/123`)
  })

  it("page rule: full URL on forum domain → forum prefix stripped", () => {
    const r = buildEmbedUrl({ forumUrl: FORUM, page: `${FORUM}/topic/456` })
    expect(r.ok && r.embedUrl).toBe(`${FORUM}/js/mb/embed.js#/topic/456`)
  })

  it("page rule: ?p= query form split + decodeURIComponent (WT altEmbedParam)", () => {
    const r = buildEmbedUrl({
      forumUrl: FORUM,
      page: `${FORUM}/somepage?p=%2Ftopic%2F789`,
    })
    expect(r.ok && r.embedUrl).toBe(`${FORUM}/js/mb/embed.js#/topic/789`)
  })

  it("home page ('' or '/') → no hash", () => {
    expect(buildEmbedUrl({ forumUrl: FORUM, page: "" }).ok).toBe(true)
    const home = buildEmbedUrl({ forumUrl: FORUM, page: "/" })
    expect(home.ok && home.embedUrl).toBe(`${FORUM}/js/mb/embed.js`)
  })

  it("rejects garbage the browser WHATWG URL() would accept (host sanity)", () => {
    // Chrome parses these (percent-encoding / bare punctuation hosts) while
    // node throws — the hostname check must reject them in BOTH runtimes.
    for (const bad of [
      "https://not a url!!",
      "https://exa mple.com",
      "https://!!!",
      "https://http",
      "https://a..b",
      "ftp://files.websitetoolbox.com",
    ]) {
      const r = buildEmbedUrl({ forumUrl: bad })
      expect(r.ok, bad).toBe(false)
    }
  })

  it("accepts real hosts: subdomains, punycode, explicit port", () => {
    for (const good of [
      "https://beta38.websitetoolbox.com",
      "http://forum.example.co.uk:8080",
      "https://xn--fsq.com",
    ]) {
      expect(buildEmbedUrl({ forumUrl: good }).ok, good).toBe(true)
    }
  })

  it("fullwidth rule: unchecked → ?fullwidth=0 appended", () => {
    const r = buildEmbedUrl({ forumUrl: FORUM, fullWidth: false })
    expect(r.ok && r.embedUrl).toBe(`${FORUM}/js/mb/embed.js?fullwidth=0`)
  })

  it("fullwidth rule: with page hash → ?fullwidth=0 after hash", () => {
    const r = buildEmbedUrl({
      forumUrl: FORUM,
      page: "topic/1",
      fullWidth: false,
    })
    expect(r.ok && r.embedUrl).toBe(
      `${FORUM}/js/mb/embed.js#/topic/1?fullwidth=0`,
    )
  })

  it("fullwidth rule: '?' already present → &fullwidth=0 (WT master)", () => {
    // A pageParam that itself carries a query ("?p=/topic/x?y=1" → split[1] =
    // "/topic/x?y=1") puts a "?" into embedUrl BEFORE the fullwidth append,
    // which is the only WT-master path that yields "&fullwidth=0".
    const r = buildEmbedUrl({
      forumUrl: FORUM,
      page: `${FORUM}/page?p=/topic/x?y=1`,
      fullWidth: false,
    })
    expect(r.ok && r.embedUrl).toBe(
      `${FORUM}/js/mb/embed.js#/topic/x?y=1&fullwidth=0`,
    )
  })

  it("mismatch rule: full URL on a different domain → WT alert text", () => {
    const r = buildEmbedUrl({
      forumUrl: FORUM,
      page: "https://other.example.com/topic/1",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("doesn't match your forum address")
      expect(r.error).toContain(FORUM)
    }
  })

  it("empty forum URL → guidance error", () => {
    const r = buildEmbedUrl({ forumUrl: "   " })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("forum URL")
  })

  it("garbage forum URL → invalid URL error", () => {
    const r = buildEmbedUrl({ forumUrl: "http://" })
    expect(r.ok).toBe(false)
  })
})

describe("buildEmbedCode — WT admin snippet shape", () => {
  it("wraps script in #wtEmbedCode div with comments + noscript (master shape)", () => {
    const r = buildEmbedCode({ forumUrl: FORUM, page: "topic/9", fullWidth: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.code).toContain("<!--Begin Website Toolbox Forum Embed Code-->")
      expect(r.code).toContain('<div id="wtEmbedCode">')
      expect(r.code).toContain(
        `<script type="text/javascript" id="embedded_forum" src="${FORUM}/js/mb/embed.js#/topic/9?fullwidth=0" ></script>`,
      )
      expect(r.code).toContain(`<noscript><a href="${FORUM}/">Forum</a></noscript>`)
      expect(r.code).toContain("<!--End Website Toolbox Forum Embed Code-->")
    }
  })

  it("propagates builder errors", () => {
    const r = buildEmbedCode({ forumUrl: "" })
    expect(r.ok).toBe(false)
  })
})
