// Pure filtering and sorting for token tables. Missing values never satisfy a
// minimum filter: a token with unknown liquidity is excluded by "min liquidity".
import type { TokenRow } from "@/lib/dexscreener/normalize";

export interface TokenFilters {
  query: string;
  minLiquidity: number | null;
  minMarketCap: number | null;
  maxMarketCap: number | null;
  minVolume24h: number | null;
  /** Maximum pair age in hours. */
  maxAgeHours: number | null;
  minChange24h: number | null;
  maxChange24h: number | null;
  favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: TokenFilters = {
  query: "",
  minLiquidity: null,
  minMarketCap: null,
  maxMarketCap: null,
  minVolume24h: null,
  maxAgeHours: null,
  minChange24h: null,
  maxChange24h: null,
  favoritesOnly: false,
};

export type SortKey =
  | "volume24h"
  | "liquidity"
  | "marketCap"
  | "change24h"
  | "change1h"
  | "age"
  | "txns24h"
  | "price"
  | "source";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function atLeast(value: number | null, min: number | null): boolean {
  if (min === null) return true;
  return value !== null && value >= min;
}

function atMost(value: number | null, max: number | null): boolean {
  if (max === null) return true;
  return value !== null && value <= max;
}

export function applyFilters(
  rows: TokenRow[],
  filters: TokenFilters,
  favorites: ReadonlySet<string>,
  nowMs: number,
): TokenRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.favoritesOnly && !favorites.has(row.mint)) return false;
    if (q && !row.name.toLowerCase().includes(q) && !row.symbol.toLowerCase().includes(q) && row.mint.toLowerCase() !== q) {
      return false;
    }
    if (!atLeast(row.liquidityUsd, filters.minLiquidity)) return false;
    const mcap = row.marketCap ?? row.fdv;
    if (!atLeast(mcap, filters.minMarketCap)) return false;
    if (!atMost(mcap, filters.maxMarketCap)) return false;
    if (!atLeast(row.volume.h24, filters.minVolume24h)) return false;
    if (filters.maxAgeHours !== null) {
      if (row.pairCreatedAt === null) return false;
      if (nowMs - row.pairCreatedAt > filters.maxAgeHours * 3_600_000) return false;
    }
    if (!atLeast(row.priceChange.h24, filters.minChange24h)) return false;
    if (!atMost(row.priceChange.h24, filters.maxChange24h)) return false;
    return true;
  });
}

function sortValue(row: TokenRow, key: SortKey): number | null {
  switch (key) {
    case "volume24h":
      return row.volume.h24;
    case "liquidity":
      return row.liquidityUsd;
    case "marketCap":
      return row.marketCap ?? row.fdv;
    case "change24h":
      return row.priceChange.h24;
    case "change1h":
      return row.priceChange.h1;
    case "age":
      // Newer pairs have larger timestamps; "desc" shows newest first.
      return row.pairCreatedAt;
    case "txns24h": {
      const { buys, sells } = row.txns.h24;
      return buys === null && sells === null ? null : (buys ?? 0) + (sells ?? 0);
    }
    case "price":
      return row.priceUsd;
    case "source":
      return null;
  }
}

/** Stable sort; rows with missing values always sink to the bottom. */
export function sortRows(rows: TokenRow[], sort: SortState): TokenRow[] {
  if (sort.key === "source") return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: sortValue(row, sort.key) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.index - b.index;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return (a.v - b.v) * factor || a.index - b.index;
    })
    .map((x) => x.row);
}

/** Parses a numeric filter input; empty or invalid means "no filter". */
export function parseFilterNumber(input: string): number | null {
  const trimmed = input.trim().replace(/[$,_\s]/g, "");
  if (!trimmed) return null;
  const match = /^(-?\d+(?:\.\d+)?)([kmb])?$/i.exec(trimmed);
  if (!match) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(match[1]) * mult;
}
