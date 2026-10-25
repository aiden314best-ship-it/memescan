// Route handler tests with a mocked global fetch: no network access is used.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINT_A, MINT_B, orderResponse, PAIR_1, rawPair, SOL } from "../fixtures";

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

beforeEach(() => {
  vi.resetModules();
  const g = globalThis as Record<string, unknown>;
  delete g.__memescanCache;
  delete g.__memescanLimiters;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/dex/listings", () => {
  it("returns validated Solana rows enriched with pair data", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/token-boosts/top/v1")) {
        return jsonResponse([
          { chainId: "solana", tokenAddress: MINT_A, amount: 10, totalAmount: 500, description: "<b>hi</b>‮" },
          { chainId: "ethereum", tokenAddress: "0xabc" },
          { chainId: "solana", tokenAddress: "not-a-mint" },
          { garbage: true },
        ]);
      }
      if (url.includes("/tokens/v1/solana/")) return jsonResponse([rawPair()]);
      throw new Error(`unexpected ${url}`);
    });
    const { GET } = await import("@/app/api/dex/listings/route");
    const res = await GET(req("/api/dex/listings?source=boosts-top"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].mint).toBe(MINT_A);
    expect(body.listings[0].description).toBe("<b>hi</b>"); // plain text, bidi stripped; rendered as text by React
    expect(body.dropped).toBe(1);
    expect(body.stale).toBe(false);
    expect(typeof body.fetchedAt).toBe("number");
  });

  it("reports upstream failures as errors instead of inventing data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    const { GET } = await import("@/app/api/dex/listings/route");
    const res = await GET(req("/api/dex/listings?source=boosts-latest"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/DEX Screener returned HTTP 500/);
  });

  it("passes through upstream rate limiting as 429", async () => {
    fetchMock.mockResolvedValue(new Response("slow down", { status: 429 }));
    const { GET } = await import("@/app/api/dex/listings/route");
    const res = await GET(req("/api/dex/listings?source=profiles-latest"));
    expect(res.status).toBe(429);
  });

  it("rejects unknown sources", async () => {
    const { GET } = await import("@/app/api/dex/listings/route");
    expect((await GET(req("/api/dex/listings?source=../../etc"))).status).toBe(400);
  });
});

describe("/api/dex/tokens", () => {
  it("validates mint lists", async () => {
    const { GET } = await import("@/app/api/dex/tokens/route");
    expect((await GET(req("/api/dex/tokens?mints=bad"))).status).toBe(400);
    expect((await GET(req("/api/dex/tokens"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves cached data marked stale when the upstream later fails", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse([rawPair()]));
      const { GET } = await import("@/app/api/dex/tokens/route");
      const first = await (await GET(req(`/api/dex/tokens?mints=${MINT_A}`))).json();
      expect(first.stale).toBe(false);
      vi.advanceTimersByTime(31_000);
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
      const second = await (await GET(req(`/api/dex/tokens?mints=${MINT_A}`))).json();
      expect(second.stale).toBe(true);
      expect(second.fetchedAt).toBe(first.fetchedAt);
      expect(second.rows[0].priceUsd).toBe(0.015);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("/api/rpc", () => {
  async function post(body: unknown) {
    const { POST } = await import("@/app/api/rpc/route");
    return POST(req("/api/rpc", { method: "POST", body: JSON.stringify(body) }));
  }

  it("blocks transaction-sending and unknown methods", async () => {
    expect((await post({ method: "sendTransaction", params: ["AAAA"] })).status).toBe(403);
    expect((await post({ method: "requestAirdrop", params: [] })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates parameters", async () => {
    expect((await post({ method: "getBalance", params: ["nope"] })).status).toBe(400);
    expect((await post({ method: "getTokenAccountsByOwner", params: [MINT_A, {}] })).status).toBe(400);
  });

  it("forwards allowed reads", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: { context: { slot: 1 }, value: 42 } }));
    const res = await post({ method: "getBalance", params: [MINT_A] });
    expect(res.status).toBe(200);
    expect((await res.json()).result.value).toBe(42);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.method).toBe("getBalance");
  });

  it("surfaces RPC errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32005, message: "rate limited" } }));
    const res = await post({ method: "getBalance", params: [MINT_A] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/rate limited/);
  });
});

describe("/api/jupiter/order", () => {
  it("proxies a valid quote to Swap API v2 without any referral fee", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderResponse({ taker: PAIR_1, transaction: "AQID" })));
    const { GET } = await import("@/app/api/jupiter/order/route");
    const res = await GET(req(`/api/jupiter/order?inputMint=${SOL}&outputMint=${MINT_A}&amount=100000000&taker=${PAIR_1}`));
    expect(res.status).toBe(200);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://api.jup.ag/swap/v2/order");
    expect(url.searchParams.get("referralAccount")).toBeNull();
    expect(url.searchParams.get("referralFee")).toBeNull();
    expect(url.searchParams.get("taker")).toBe(PAIR_1);
  });

  it("sends the API key only from the server when configured", async () => {
    vi.stubEnv("JUPITER_API_KEY", "jup_test_key");
    fetchMock.mockResolvedValue(jsonResponse(orderResponse()));
    const { GET } = await import("@/app/api/jupiter/order/route");
    const res = await GET(req(`/api/jupiter/order?inputMint=${SOL}&outputMint=${MINT_A}&amount=100000000`));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers["x-api-key"]).toBe("jup_test_key");
    expect(JSON.stringify(await res.json())).not.toContain("jup_test_key");
  });

  it("refuses quotes that do not match the request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderResponse({ outputMint: MINT_B })));
    const { GET } = await import("@/app/api/jupiter/order/route");
    const res = await GET(req(`/api/jupiter/order?inputMint=${SOL}&outputMint=${MINT_A}&amount=100000000`));
    expect(res.status).toBe(502);
  });

  it("refuses quotes built for another wallet", async () => {
    fetchMock.mockResolvedValue(jsonResponse(orderResponse({ taker: MINT_B, transaction: "AQID" })));
    const { GET } = await import("@/app/api/jupiter/order/route");
    const res = await GET(req(`/api/jupiter/order?inputMint=${SOL}&outputMint=${MINT_A}&amount=100000000&taker=${PAIR_1}`));
    expect(res.status).toBe(502);
  });

  it("rejects invalid parameters before calling Jupiter", async () => {
    const { GET } = await import("@/app/api/jupiter/order/route");
    const res = await GET(req(`/api/jupiter/order?inputMint=${SOL}&outputMint=${MINT_A}&amount=-5`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/api/jupiter/execute", () => {
  it("is disabled unless explicitly enabled", async () => {
    const { POST } = await import("@/app/api/jupiter/execute/route");
    const res = await POST(req("/api/jupiter/execute", { method: "POST", body: JSON.stringify({ signedTransaction: "AQID", requestId: "abc" }) }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a signed transaction when enabled and reports failures faithfully", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SWAP_EXECUTION", "true");
    fetchMock.mockResolvedValue(jsonResponse({ status: "Failed", code: -1005, signature: "5".repeat(88), error: "expired" }));
    const { POST } = await import("@/app/api/jupiter/execute/route");
    const res = await POST(req("/api/jupiter/execute", { method: "POST", body: JSON.stringify({ signedTransaction: "AQID", requestId: "abc-1" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.status).toBe("Failed");
    expect(body.result.code).toBe(-1005);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.jup.ag/swap/v2/execute");
  });

  it("rejects malformed bodies when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SWAP_EXECUTION", "true");
    const { POST } = await import("@/app/api/jupiter/execute/route");
    const res = await POST(req("/api/jupiter/execute", { method: "POST", body: JSON.stringify({ signedTransaction: "%%%", requestId: "a" }) }));
    expect(res.status).toBe(400);
  });
});

describe("/api/risk/[mint]", () => {
  it("combines RPC and market data and marks unavailable checks as unknown", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("dexscreener")) return jsonResponse([rawPair({ liquidity: { usd: 8000 } })]);
      const { method } = JSON.parse(String(init?.body));
      if (method === "getAccountInfo") {
        return jsonResponse({
          result: {
            value: {
              data: { program: "spl-token", parsed: { type: "mint", info: { decimals: 6, supply: "1000", isInitialized: true, mintAuthority: PAIR_1, freezeAuthority: null } } },
            },
          },
        });
      }
      if (method === "getTokenLargestAccounts") return jsonResponse({ error: { code: -32010, message: "method disabled" } });
      throw new Error(`unexpected ${method}`);
    });
    const { GET } = await import("@/app/api/risk/[mint]/route");
    const res = await GET(req(`/api/risk/${MINT_A}`), { params: Promise.resolve({ mint: MINT_A }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = Object.fromEntries(body.signals.map((s: { id: string; status: string }) => [s.id, s.status]));
    expect(byId["mint-authority"]).toBe("high");
    expect(byId["freeze-authority"]).toBe("ok");
    expect(byId.liquidity).toBe("high");
    expect(byId.concentration).toBe("unknown");
    expect(byId["lp-lock"]).toBe("unknown");
    expect(body.errors.holders).toMatch(/method disabled/);
  });

  it("rejects invalid mints", async () => {
    const { GET } = await import("@/app/api/risk/[mint]/route");
    const res = await GET(req("/api/risk/xyz"), { params: Promise.resolve({ mint: "xyz" }) });
    expect(res.status).toBe(400);
  });
});
