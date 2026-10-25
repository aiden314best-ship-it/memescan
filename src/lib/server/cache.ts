// In-memory TTL cache with request de-duplication and stale fallback.
// Scope: one server process. On serverless hosts each instance has its own cache,
// which is acceptable for an MVP and still dramatically reduces upstream calls.
import "server-only";

interface Entry<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
}

export interface CachedResult<T> {
  value: T;
  fetchedAt: number;
  /** True when the upstream failed and an older cached value was served instead. */
  stale: boolean;
  /** Upstream error message when stale is true. */
  staleReason?: string;
}

const MAX_ENTRIES = 500;
// Stale values are kept around for this long after expiry to cover upstream outages.
const STALE_GRACE_MS = 10 * 60_000;

export class TtlCache {
  private entries = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<CachedResult<unknown>>>();

  constructor(private now: () => number = Date.now) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<CachedResult<T>> {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > this.now()) {
      return { value: hit.value, fetchedAt: hit.fetchedAt, stale: false };
    }
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<CachedResult<T>>;

    const promise = (async (): Promise<CachedResult<T>> => {
      try {
        const value = await load();
        const fetchedAt = this.now();
        this.set(key, { value, fetchedAt, expiresAt: fetchedAt + ttlMs });
        return { value, fetchedAt, stale: false };
      } catch (error) {
        if (hit && hit.expiresAt + STALE_GRACE_MS > this.now()) {
          return {
            value: hit.value,
            fetchedAt: hit.fetchedAt,
            stale: true,
            staleReason: error instanceof Error ? error.message : "Upstream error",
          };
        }
        throw error;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  private set(key: string, entry: Entry<unknown>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

// Survive Next.js dev-mode module reloads.
const globalForCache = globalThis as unknown as { __memescanCache?: TtlCache };
export const cache = (globalForCache.__memescanCache ??= new TtlCache());
