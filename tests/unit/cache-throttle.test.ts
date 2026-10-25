import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/server/cache";
import { RateLimitError, SlidingWindowLimiter } from "@/lib/server/throttle";

describe("TtlCache", () => {
  it("serves fresh hits without reloading", async () => {
    let t = 0;
    const cache = new TtlCache(() => t);
    const load = vi.fn().mockResolvedValue("v1");
    await cache.get("k", 1000, load);
    t = 500;
    const r = await cache.get("k", 1000, load);
    expect(r).toEqual({ value: "v1", fetchedAt: 0, stale: false });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent loads", async () => {
    const cache = new TtlCache(() => 0);
    const load = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(() => r("v"), 5)));
    await Promise.all([cache.get("k", 1000, load), cache.get("k", 1000, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves stale data (flagged) when the upstream fails after expiry", async () => {
    let t = 0;
    const cache = new TtlCache(() => t);
    await cache.get("k", 1000, async () => "old");
    t = 2000;
    const r = await cache.get("k", 1000, async () => {
      throw new Error("upstream 500");
    });
    expect(r).toMatchObject({ value: "old", stale: true, staleReason: "upstream 500", fetchedAt: 0 });
  });

  it("throws when there is nothing cached to fall back to", async () => {
    const cache = new TtlCache(() => 0);
    await expect(
      cache.get("k", 1000, async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
  });
});

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    let t = 0;
    const lim = new SlidingWindowLimiter(2, 1000, () => t);
    expect(lim.tryAcquire("a")).toBe(0);
    expect(lim.tryAcquire("a")).toBe(0);
    expect(lim.tryAcquire("a")).toBe(1000);
    expect(lim.tryAcquire("b")).toBe(0);
    t = 1001;
    expect(lim.tryAcquire("a")).toBe(0);
  });

  it("rejects with RateLimitError when the wait would exceed maxWait", async () => {
    const lim = new SlidingWindowLimiter(1, 60_000, () => 0);
    await lim.acquire("x");
    await expect(lim.acquire("x", 100)).rejects.toBeInstanceOf(RateLimitError);
  });
});
