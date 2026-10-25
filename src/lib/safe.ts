// Sanitisers for untrusted strings and URLs coming from third-party APIs.
// Token names, symbols and links are attacker-controlled: anyone can launch a token.

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

/** Strips control/bidi characters and clamps length. Output is rendered as plain text only. */
export function cleanText(value: unknown, maxLength = 64): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim().slice(0, maxLength);
}

/** Returns the URL only if it is a well-formed http(s) URL; otherwise null. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Only images hosted by DEX Screener's own CDNs are displayed. Arbitrary image URLs
// from token metadata could be used for tracking, so they are dropped.
const IMAGE_HOSTS = new Set(["dd.dexscreener.com", "cdn.dexscreener.com"]);

export function safeImageUrl(value: unknown): string | null {
  const url = safeExternalUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.protocol === "https:" && IMAGE_HOSTS.has(parsed.hostname) ? url : null;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
