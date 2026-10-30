/**
 * Embed-URL builder — pure string logic, no DOM / Framer API.
 *
 * Source of truth: Website Toolbox repo `data/js/wt_global/embed.js`
 * (`embed.updateEmbedCode()` on origin/master, verified 2026-10-28).
 * Every rule below is annotated with the corresponding WT master behavior;
 * the unit tests pin each rule so a refactor cannot silently drift.
 */

export interface EmbedUrlInput {
  /** Forum address, e.g. "https://acme.websitetoolbox.com" (trailing slash ok). */
  forumUrl: string
  /**
   * Optional forum page: a full URL on the forum's own domain, or a bare
   * path like "topic/123". Mirrors WT admin's "Specific page" field.
   */
  page?: string
  /** false → append fullwidth=0 (WT admin "show forum in full width" unchecked). */
  fullWidth?: boolean
}

export type EmbedUrlResult =
  | { ok: true; embedUrl: string; pageParam: string | null }
  | { ok: false; error: string }

/** WT master altEmbedParam: '?p=' normally, '?wtp=' when alt_embed_param is on. */
const ALT_EMBED_PARAM = "?p="

/**
 * Real-host check. Browser `new URL()` is WHATWG-lenient: "https://not a url!!"
 * PARSES there (host "not%20a%20url!!") and "https://!!!" parses — while node
 * throws, so unit tests alone miss it (proven on Chrome 149 vs node 22,
 * 2026-10-30). A WT forum is always an FQDN: ≥2 dot-separated DNS labels,
 * [a-z0-9-] only per label, no leading/trailing hyphen (punycode "xn--" ok).
 */
const HOSTNAME_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

/** Trim trailing slashes so "/js/mb/embed.js" never gets a "//" seam. */
function normalizeForumUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProto.replace(/\/+$/, "")
}

/**
 * Resolve the page the user entered into a "#<path>" hash fragment.
 * Replicates updateEmbedCode()'s pageParam block:
 *  - "?p=<path>" query form → take the value (decodeURIComponent, ensure leading "/")
 *  - full URL on the forum domain → strip the forum prefix
 *  - bare path → ensure leading "/"
 *  - home ("", "/") → no hash
 * Returns { error } when a full URL is on a different domain (WT shows an
 * alert in that case; we surface it as a field error).
 */
function resolvePageParam(
  forumUrl: string,
  page: string,
): { pageParam: string | null } | { error: string } {
  const raw = page.trim()
  if (!raw || raw === "/") return { pageParam: null }

  let pageParam: string

  if (raw.includes(ALT_EMBED_PARAM)) {
    // Query form: "...?p=/topic/123" (WT splits on altEmbedParam and takes [1]).
    pageParam = decodeURIComponent(raw.split(ALT_EMBED_PARAM)[1])
  } else if (/^https?:\/\//i.test(raw)) {
    // Full URL: must live on the forum's domain (WT master alert rule).
    if (!raw.startsWith(forumUrl + "/") && raw !== forumUrl) {
      return {
        error:
          "The address you entered doesn't match your forum address (" +
          forumUrl +
          "). Please enter a page from your forum.",
      }
    }
    pageParam = raw.slice(forumUrl.length)
  } else {
    // Bare path, e.g. "topic/123" or "/topic/123".
    pageParam = raw
  }

  if (pageParam.charAt(0) !== "/") pageParam = "/" + pageParam
  if (pageParam === "/") return { pageParam: null }
  return { pageParam }
}

/**
 * Build the embed script URL.
 *
 * WT master rules (updateEmbedCode):
 *   embedUrl = forumUrl + "/js/mb/embed.js"
 *   page     → "#" + pageParam          (home → no hash)
 *   !fullWidth → append "?fullwidth=0" or "&fullwidth=0" when "?" already present
 */
export function buildEmbedUrl(input: EmbedUrlInput): EmbedUrlResult {
  const forumUrl = normalizeForumUrl(input.forumUrl)
  if (!forumUrl) {
    return { ok: false, error: "Enter your forum URL (e.g. https://acme.websitetoolbox.com)." }
  }
  let parsed: URL
  try {
    parsed = new URL(forumUrl)
  } catch {
    return { ok: false, error: `"${input.forumUrl}" is not a valid URL.` }
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: `"${input.forumUrl}" must be an http(s) address.` }
  }
  if (!HOSTNAME_RE.test(parsed.hostname)) {
    return {
      ok: false,
      error: `"${input.forumUrl}" doesn't look like a forum address — expected e.g. acme.websitetoolbox.com.`,
    }
  }

  let pageParam: string | null = null
  if (input.page && input.page.trim()) {
    const resolved = resolvePageParam(forumUrl, input.page)
    if ("error" in resolved) return { ok: false, error: resolved.error }
    pageParam = resolved.pageParam
  }

  let embedUrl = forumUrl + "/js/mb/embed.js"
  if (pageParam) embedUrl += "#" + pageParam

  if (input.fullWidth === false) {
    embedUrl += embedUrl.indexOf("?") > -1 ? "&fullwidth=0" : "?fullwidth=0"
  }

  return { ok: true, embedUrl, pageParam }
}

export type EmbedCodeResult =
  | { ok: true; embedUrl: string; pageParam: string | null; code: string }
  | { ok: false; error: string }

/**
 * Full paste-ready snippet, matching the WT admin embed code shape
 * (cgi-bin/members/mb/embed on master): wrapper comment, #wtEmbedCode div,
 * script#embedded_forum, noscript fallback.
 */
export function buildEmbedCode(input: EmbedUrlInput): EmbedCodeResult {
  const result = buildEmbedUrl(input)
  if (!result.ok) return result

  const forumHome = normalizeForumUrl(input.forumUrl) + "/"
  const code =
    "<!--Begin Website Toolbox Forum Embed Code-->\n" +
    '<div id="wtEmbedCode">' +
    `<script type="text/javascript" id="embedded_forum" src="${result.embedUrl}" ></script>` +
    `<noscript><a href="${forumHome}">Forum</a></noscript>` +
    "</div>\n" +
    "<!--End Website Toolbox Forum Embed Code-->"
  return { ...result, code }
}
