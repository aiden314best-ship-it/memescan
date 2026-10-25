// Sliding-window rate limiter. Used both to stay under upstream API limits and to
// protect our own API routes from being hammered by a single client.
import "server-only";

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Records a hit if allowed. Returns ms to wait when the window is full, or 0. */
  tryAcquire(key = "default"): number {
    const now = this.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return this.windowMs - (now - list[0]);
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return 0;
  }

  /** Waits up to maxWaitMs for a slot; throws RateLimitError if none frees up in time. */
  async acquire(key = "default", maxWaitMs = 3_000): Promise<void> {
    const started = this.now();
    for (;;) {
      const wait = this.tryAcquire(key);
      if (wait === 0) return;
      if (this.now() - started + wait > maxWaitMs) throw new RateLimitError(wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  private prune(now: number) {
    for (const [key, list] of this.hits) {
      if (!list.some((t) => now - t < this.windowMs)) this.hits.delete(key);
    }
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("Rate limit reached. Please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
    public upstream: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const g = globalThis as unknown as { __memescanLimiters?: Record<string, SlidingWindowLimiter> };
const limiters = (g.__memescanLimiters ??= {
  // DEX Screener documents 60 req/min for profile/boost endpoints and 300 req/min for
  // pair/search/token endpoints. Stay comfortably below both.
  dexSlow: new SlidingWindowLimiter(50, 60_000),
  dexFast: new SlidingWindowLimiter(250, 60_000),
  // Jupiter keyless tier: 0.5 RPS on a 60s window (30/min). Free key: 60/min.
  jupiter: new SlidingWindowLimiter(process.env.JUPITER_API_KEY ? 55 : 28, 60_000),
  jupiterExecute: new SlidingWindowLimiter(600, 60_000),
  rpc: new SlidingWindowLimiter(Number(process.env.RPC_REQUESTS_PER_MINUTE) || 90, 60_000),
  // Per-client protection for our own routes.
  client: new SlidingWindowLimiter(240, 60_000),
});

export const throttles = limiters;
