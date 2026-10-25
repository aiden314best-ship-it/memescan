import "server-only";
import { NextResponse } from "next/server";
import { RateLimitError, throttles, UpstreamError } from "./throttle";

const UPSTREAM_TIMEOUT_MS = 12_000;

/** Fetches JSON from an upstream API with a timeout and typed errors. Never logs bodies. */
export async function fetchJson(
  url: string,
  upstream: string,
  { timeoutMs = UPSTREAM_TIMEOUT_MS, ...init }: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json", ...init.headers },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "is unreachable";
    throw new UpstreamError(`${upstream} ${reason}.`, 504, upstream);
  }
  if (res.status === 429) {
    throw new UpstreamError(`${upstream} rate limit reached. Try again shortly.`, 429, upstream);
  }
  if (!res.ok) {
    // Body text can include upstream error detail useful to users (e.g. invalid mint).
    let detail = "";
    try {
      const body = (await res.json()) as { error?: unknown; message?: unknown };
      const msg = body?.error ?? body?.message;
      if (typeof msg === "string") detail = `: ${msg.slice(0, 200)}`;
    } catch {
      // ignore non-JSON bodies
    }
    throw new UpstreamError(`${upstream} returned HTTP ${res.status}${detail}`, res.status, upstream);
  }
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(`${upstream} returned invalid JSON.`, 502, upstream);
  }
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/** Applies the per-client limit. Returns a 429 response when exceeded. */
export function limitClient(request: Request): NextResponse | null {
  const wait = throttles.client.tryAcquire(clientKey(request));
  if (wait === 0) return null;
  return NextResponse.json(
    { error: "Too many requests from this client. Slow down and retry shortly." },
    { status: 429, headers: { "retry-after": String(Math.ceil(wait / 1000)) } },
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: "Our request budget for this data source is used up for the moment. Retry in a few seconds." },
      { status: 429, headers: { "retry-after": String(Math.ceil(error.retryAfterMs / 1000)) } },
    );
  }
  if (error instanceof UpstreamError) {
    const status = error.status === 429 ? 429 : error.status >= 500 || error.status === 504 ? 502 : error.status;
    return NextResponse.json({ error: error.message, upstream: error.upstream }, { status });
  }
  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Unexpected API error:", error instanceof Error ? error.message : "unknown");
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export class BadRequestError extends Error {}

export function json<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "cache-control": "no-store", ...init?.headers },
  });
}
