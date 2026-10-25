// Response shapes of this app's own /api routes, shared by route handlers and the UI.
import type { PoolInfo, TokenRow } from "@/lib/dexscreener/normalize";
import type { HolderSnapshot, MintInfo, RiskSignal } from "@/lib/risk";

export interface DataMeta {
  /** Epoch ms when the data was fetched from the upstream source. */
  fetchedAt: number;
  /** True when served from cache after an upstream failure. */
  stale: boolean;
  staleReason?: string;
  /** Upstream items rejected by validation. */
  dropped: number;
  source: string;
}

export interface ListingInfo {
  mint: string;
  boostAmount: number | null;
  totalBoostAmount: number | null;
  /** Plain text, already cleaned. Render as text only. */
  description: string;
  listingUrl: string | null;
  claimDate: string | null;
}

export interface ListingsResponse extends DataMeta {
  rows: TokenRow[];
  listings: ListingInfo[];
  /** Listed tokens for which DEX Screener returned no Solana pair. */
  missingPairs: number;
}

export interface RowsResponse extends DataMeta {
  rows: TokenRow[];
}

export interface TokenResponse extends DataMeta {
  row: TokenRow | null;
  pools: PoolInfo[];
}

export interface RiskResponse {
  mint: string;
  checkedAt: number;
  mintInfo: MintInfo | null;
  holders: HolderSnapshot | null;
  signals: RiskSignal[];
  market: { liquidityUsd: number | null; marketCap: number | null; pools: number; fetchedAt: number | null };
  errors: { rpc?: string; holders?: string; dex?: string };
}

export interface PriceEntry {
  usdPrice: number;
  decimals: number | null;
  priceChange24h: number | null;
  blockId: number | null;
}

export interface PricesResponse {
  prices: Record<string, PriceEntry>;
  fetchedAt: number;
  stale: boolean;
  source: string;
}

export interface ServiceStatus {
  name: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

export interface StatusResponse {
  checkedAt: number;
  services: ServiceStatus[];
  config: {
    rpcHost: string;
    jupiterKeyConfigured: boolean;
    swapExecutionEnabled: boolean;
  };
}
