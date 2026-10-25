import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "@/lib/alerts";
import { toTokenRow } from "@/lib/dexscreener/normalize";
import { pairSchema } from "@/lib/dexscreener/schema";
import { applyFilters, DEFAULT_FILTERS, parseFilterNumber, sortRows } from "@/lib/filters";
import { MINT_A, MINT_B, PAIR_2, rawPair } from "../fixtures";

const NOW = 1_700_000_000_000 + 10 * 3_600_000; // 10h after the fixture pair was created
const a = toTokenRow(pairSchema.parse(rawPair()));
const b = toTokenRow(
  pairSchema.parse(
    rawPair({
      baseToken: { address: MINT_B, name: "Other", symbol: "OTH" },
      pairAddress: PAIR_2,
      liquidity: undefined,
      volume: { h24: 999999 },
      marketCap: 50_000,
      pairCreatedAt: NOW - 30 * 3_600_000,
    }),
  ),
);

describe("filters", () => {
  it("matches name, symbol or exact mint", () => {
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, query: "oth" }, new Set(), NOW)).toEqual([b]);
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, query: MINT_A.toLowerCase() }, new Set(), NOW)).toEqual([a]);
  });

  it("excludes tokens with missing values when a minimum is set", () => {
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, minLiquidity: 1 }, new Set(), NOW)).toEqual([a]);
  });

  it("filters by market cap range, age and change", () => {
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, maxMarketCap: 100_000 }, new Set(), NOW)).toEqual([b]);
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, maxAgeHours: 24 }, new Set(), NOW)).toEqual([a]);
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, minChange24h: 30 }, new Set(), NOW)).toEqual([]);
    expect(applyFilters([a, b], { ...DEFAULT_FILTERS, favoritesOnly: true }, new Set([MINT_B]), NOW)).toEqual([b]);
  });

  it("sorts with missing values last in both directions", () => {
    expect(sortRows([a, b], { key: "volume24h", dir: "desc" }).map((r) => r.mint)).toEqual([MINT_B, MINT_A]);
    expect(sortRows([b, a], { key: "liquidity", dir: "desc" })[1]).toBe(b);
    expect(sortRows([b, a], { key: "liquidity", dir: "asc" })[1]).toBe(b);
    expect(sortRows([a, b], { key: "age", dir: "desc" })[0]).toBe(a);
  });

  it("parses filter shorthand", () => {
    expect(parseFilterNumber("50k")).toBe(50_000);
    expect(parseFilterNumber("$1.5M")).toBe(1_500_000);
    expect(parseFilterNumber("-20")).toBe(-20);
    expect(parseFilterNumber("")).toBeNull();
    expect(parseFilterNumber("abc")).toBeNull();
  });
});

describe("alerts", () => {
  const rule = { id: "r1", mint: MINT_A, metric: "price" as const, op: "above" as const, value: 0.01, enabled: true };

  it("fires when the condition is met", () => {
    expect(evaluateAlerts([rule], [a])).toEqual([{ ruleId: "r1", observed: 0.015 }]);
    expect(evaluateAlerts([{ ...rule, op: "below" }], [a])).toEqual([]);
    expect(evaluateAlerts([{ ...rule, metric: "marketCap", value: 1_000_000 }], [a])).toHaveLength(1);
  });

  it("never fires on disabled rules or missing data", () => {
    expect(evaluateAlerts([{ ...rule, enabled: false }], [a])).toEqual([]);
    expect(evaluateAlerts([rule], [])).toEqual([]);
    expect(evaluateAlerts([rule], [{ ...a, priceUsd: null }])).toEqual([]);
  });
});
