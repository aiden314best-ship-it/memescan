import { describe, expect, it } from "vitest";
import { bestPairFor, rowsFromPairs, toTokenRow } from "@/lib/dexscreener/normalize";
import { pairSchema, parseArray, parsePairsEnvelope } from "@/lib/dexscreener/schema";
import { MINT_A, MINT_B, PAIR_1, PAIR_2, PAIR_3, rawPair, SOL } from "../fixtures";

describe("DEX Screener validation", () => {
  it("parses a valid pair and coerces numeric strings", () => {
    const parsed = pairSchema.parse(rawPair());
    expect(parsed.priceUsd).toBe(0.015);
    expect(parsed.priceNative).toBe(0.0001);
  });

  it("turns missing or garbage numbers into null, not zero", () => {
    const parsed = pairSchema.parse(rawPair({ priceUsd: "abc", marketCap: undefined, liquidity: undefined, fdv: null }));
    expect(parsed.priceUsd).toBeNull();
    expect(parsed.marketCap).toBeNull();
    expect(parsed.fdv).toBeNull();
    expect(parsed.liquidity).toBeUndefined();
    const row = toTokenRow(parsed);
    expect(row.liquidityUsd).toBeNull();
  });

  it("drops malformed items instead of guessing", () => {
    const { items, dropped } = parseArray(pairSchema, [rawPair(), { chainId: "solana" }, "junk", null]);
    expect(items).toHaveLength(1);
    expect(dropped).toBe(3);
  });

  it("handles the { pairs } envelope and null pairs", () => {
    expect(parsePairsEnvelope({ schemaVersion: "1.0.0", pairs: [rawPair()] }).items).toHaveLength(1);
    expect(parsePairsEnvelope({ schemaVersion: "1.0.0", pairs: null }).items).toHaveLength(0);
    expect(parsePairsEnvelope([rawPair()]).items).toHaveLength(1);
  });
});

describe("normalisation", () => {
  it("removes unsafe links and keeps safe ones", () => {
    const row = toTokenRow(pairSchema.parse(rawPair()));
    expect(row.websites).toEqual([{ label: "Website", url: "https://example.com/" }]);
    expect(row.socials).toHaveLength(1);
    expect(row.imageUrl).toContain("dd.dexscreener.com");
  });

  it("picks the most liquid pair where the token is the base token", () => {
    const pairs = [
      pairSchema.parse(rawPair({ pairAddress: PAIR_1, liquidity: { usd: 1000 } })),
      pairSchema.parse(rawPair({ pairAddress: PAIR_2, liquidity: { usd: 90000 } })),
      // Higher liquidity but our token is the QUOTE token here: must be ignored.
      pairSchema.parse(
        rawPair({ pairAddress: PAIR_3, baseToken: { address: SOL, symbol: "SOL" }, quoteToken: { address: MINT_A, symbol: "TEST" }, liquidity: { usd: 1e9 } }),
      ),
    ];
    expect(bestPairFor(MINT_A, pairs)?.pairAddress).toBe(PAIR_2);
    const row = toTokenRow(bestPairFor(MINT_A, pairs)!, pairs);
    expect(row.pairCount).toBe(2);
    expect(row.totalLiquidityUsd).toBe(91000);
  });

  it("groups pairs by mint, keeps requested order and skips other chains", () => {
    const pairs = [
      pairSchema.parse(rawPair()),
      pairSchema.parse(rawPair({ baseToken: { address: MINT_B, symbol: "B" }, pairAddress: PAIR_2 })),
      pairSchema.parse(rawPair({ chainId: "ethereum", baseToken: { address: MINT_B, symbol: "B" }, pairAddress: PAIR_3 })),
    ];
    const rows = rowsFromPairs(pairs, [MINT_B, MINT_A]);
    expect(rows.map((r) => r.mint)).toEqual([MINT_B, MINT_A]);
    expect(rows[0].pairCount).toBe(1);
  });

  it("falls back to a safe DEX Screener URL", () => {
    const row = toTokenRow(pairSchema.parse(rawPair({ url: "javascript:alert(1)" })));
    expect(row.pairUrl).toBe(`https://dexscreener.com/solana/${PAIR_1}`);
  });
});
