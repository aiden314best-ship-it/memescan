// Risk signal evaluation. Pure functions over data we actually fetched; anything we
// could not verify is reported as "unknown", never assumed to be fine.
//
// Deliberately there is no overall score and no "safe" label: passing every check
// here does not make a token safe.
import { INCINERATOR_ADDRESS } from "@/lib/solana/address";

export type SignalStatus = "ok" | "caution" | "high" | "unknown" | "info";

export interface RiskSignal {
  id: string;
  label: string;
  status: SignalStatus;
  /** What we observed, in plain language. */
  detail: string;
  /** Why this signal matters. */
  why: string;
  source: string;
}

export interface MintInfo {
  program: "spl-token" | "spl-token-2022" | "unknown";
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
  extensions: { name: string; state: Record<string, unknown> }[];
}

export interface HolderAccount {
  tokenAccount: string;
  owner: string | null;
  amount: string;
  /** Share of total supply, 0–100. */
  pctOfSupply: number;
  label: "pool" | "burn" | "amm-authority" | null;
}

export interface HolderSnapshot {
  accounts: HolderAccount[];
  supply: string;
  decimals: number;
}

export interface PoolSummary {
  pairAddress: string;
  liquidityUsd: number | null;
  pairCreatedAt: number | null;
}

/** Well-known AMM authority accounts that hold pooled tokens for many pools. */
export const KNOWN_AMM_AUTHORITIES: Record<string, string> = {
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": "Raydium AMM v4 authority",
  GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL: "Raydium CPMM authority",
};

// ---------------------------------------------------------------------------
// Parsing

export function parseMintAccount(value: unknown): MintInfo | null {
  const v = value as {
    owner?: string;
    data?: { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
  } | null;
  const parsed = v?.data?.parsed;
  if (!parsed || parsed.type !== "mint" || !parsed.info) return null;
  const info = parsed.info;
  const program = v?.data?.program === "spl-token-2022" ? "spl-token-2022" : v?.data?.program === "spl-token" ? "spl-token" : "unknown";
  const decimals = typeof info.decimals === "number" ? info.decimals : NaN;
  const supply = typeof info.supply === "string" && /^\d+$/.test(info.supply) ? info.supply : null;
  if (!Number.isInteger(decimals) || supply === null) return null;
  const extensions = Array.isArray(info.extensions)
    ? (info.extensions as { extension?: unknown; state?: unknown }[])
        .filter((e) => typeof e?.extension === "string")
        .map((e) => ({ name: e.extension as string, state: (e.state ?? {}) as Record<string, unknown> }))
    : [];
  return {
    program,
    decimals,
    supply,
    mintAuthority: typeof info.mintAuthority === "string" ? info.mintAuthority : null,
    freezeAuthority: typeof info.freezeAuthority === "string" ? info.freezeAuthority : null,
    isInitialized: info.isInitialized === true,
    extensions,
  };
}

export function labelHolders(
  largest: { address: string; amount: string }[],
  owners: Record<string, string | null>,
  supply: string,
  pairAddresses: string[],
): HolderAccount[] {
  const total = BigInt(supply);
  const pairs = new Set(pairAddresses);
  return largest.map((a) => {
    const owner = owners[a.address] ?? null;
    let label: HolderAccount["label"] = null;
    if (owner && pairs.has(owner)) label = "pool";
    else if (pairs.has(a.address)) label = "pool";
    else if (owner === INCINERATOR_ADDRESS) label = "burn";
    else if (owner && KNOWN_AMM_AUTHORITIES[owner]) label = "amm-authority";
    const pct = total > 0n ? Number((BigInt(a.amount) * 1_000_000n) / total) / 10_000 : 0;
    return { tokenAccount: a.address, owner, amount: a.amount, pctOfSupply: pct, label };
  });
}

// ---------------------------------------------------------------------------
// Signals

const SRC_RPC = "Solana RPC (on-chain)";
const SRC_DEX = "DEX Screener";

export function authoritySignals(mint: MintInfo | null, rpcError?: string): RiskSignal[] {
  if (!mint) {
    const detail = rpcError ? `Could not read the mint account: ${rpcError}` : "Mint account not found or not a token mint.";
    return [
      {
        id: "mint-authority",
        label: "Mint authority",
        status: "unknown",
        detail,
        why: "If a mint authority exists, its holder can create new tokens at any time and dilute every holder.",
        source: SRC_RPC,
      },
      {
        id: "freeze-authority",
        label: "Freeze authority",
        status: "unknown",
        detail,
        why: "A freeze authority can freeze token accounts, which can stop holders from selling or transferring.",
        source: SRC_RPC,
      },
    ];
  }
  return [
    {
      id: "mint-authority",
      label: "Mint authority",
      status: mint.mintAuthority ? "high" : "ok",
      detail: mint.mintAuthority
        ? `Mint authority is set to ${mint.mintAuthority}. New supply can be minted.`
        : "Mint authority is disabled (null). Supply cannot be increased through the mint.",
      why: "If a mint authority exists, its holder can create new tokens at any time and dilute every holder.",
      source: SRC_RPC,
    },
    {
      id: "freeze-authority",
      label: "Freeze authority",
      status: mint.freezeAuthority ? "high" : "ok",
      detail: mint.freezeAuthority
        ? `Freeze authority is set to ${mint.freezeAuthority}. Token accounts can be frozen.`
        : "Freeze authority is disabled (null).",
      why: "A freeze authority can freeze token accounts, which can stop holders from selling or transferring.",
      source: SRC_RPC,
    },
  ];
}

const EXTENSION_RISKS: Record<string, { status: SignalStatus; why: string }> = {
  permanentDelegate: {
    status: "high",
    why: "A permanent delegate can transfer or burn tokens from ANY holder's account without their approval.",
  },
  transferHook: {
    status: "caution",
    why: "A transfer hook runs a custom program on every transfer. It can add fees, restrict or block transfers (including sells).",
  },
  transferFeeConfig: {
    status: "caution",
    why: "Transfer fees take a cut of every transfer, including buys and sells. The fee authority may be able to change the rate.",
  },
  defaultAccountState: {
    status: "caution",
    why: "New token accounts may start frozen, requiring the freeze authority to unfreeze them before they can be used.",
  },
  nonTransferable: { status: "high", why: "Non-transferable tokens cannot be moved or sold." },
  pausableConfig: { status: "high", why: "A pause authority can halt all transfers of this token." },
  mintCloseAuthority: {
    status: "caution",
    why: "The mint close authority can close the mint account once supply is zero; combined with other powers it adds control risk.",
  },
  confidentialTransferMint: {
    status: "info",
    why: "Confidential transfers hide amounts, which makes on-chain activity harder to analyse.",
  },
};

export function extensionSignals(mint: MintInfo | null): RiskSignal[] {
  if (!mint) return [];
  if (mint.program !== "spl-token-2022") {
    return [
      {
        id: "token-program",
        label: "Token program",
        status: "info",
        detail: "Standard SPL Token program (no Token-2022 extensions possible).",
        why: "Token-2022 extensions such as permanent delegates or transfer hooks can give issuers extra control. Standard SPL tokens cannot have them.",
        source: SRC_RPC,
      },
    ];
  }
  const signals: RiskSignal[] = [];
  for (const ext of mint.extensions) {
    const risk = EXTENSION_RISKS[ext.name];
    if (!risk) continue;
    let status = risk.status;
    let detail = `Token-2022 extension "${ext.name}" is enabled.`;
    if (ext.name === "defaultAccountState" && ext.state.accountState === "frozen") {
      status = "high";
      detail = "New token accounts are frozen by default.";
    }
    if (ext.name === "transferFeeConfig") {
      const newer = ext.state.newerTransferFee as { transferFeeBasisPoints?: number } | undefined;
      const bps = newer?.transferFeeBasisPoints;
      if (typeof bps === "number") {
        detail = `Transfer fee: ${(bps / 100).toFixed(2)}% per transfer.`;
        status = bps === 0 ? "info" : bps >= 500 ? "high" : "caution";
      }
    }
    if (ext.name === "permanentDelegate" && typeof ext.state.delegate === "string") {
      detail = `Permanent delegate: ${ext.state.delegate}.`;
    }
    signals.push({ id: `ext-${ext.name}`, label: `Extension: ${ext.name}`, status, detail, why: risk.why, source: SRC_RPC });
  }
  signals.unshift({
    id: "token-program",
    label: "Token program",
    status: "info",
    detail: `Token-2022 program with ${mint.extensions.length} extension(s): ${mint.extensions.map((e) => e.name).join(", ") || "none"}.`,
    why: "Token-2022 extensions can give the issuer powers beyond a standard token. Each risky extension is listed separately.",
    source: SRC_RPC,
  });
  return signals;
}

export function concentrationSignals(snapshot: HolderSnapshot | null, error?: string): RiskSignal[] {
  const why =
    "When a few wallets hold most of the supply, a single sale can crash the price. Note: one person can control many wallets, so real concentration can be higher than shown.";
  if (!snapshot || snapshot.accounts.length === 0) {
    return [
      {
        id: "concentration",
        label: "Top holder concentration",
        status: "unknown",
        detail: error ? `Largest token accounts unavailable: ${error}` : "Largest token accounts unavailable.",
        why,
        source: SRC_RPC,
      },
    ];
  }
  const unlabeled = snapshot.accounts.filter((a) => a.label === null);
  const top1 = unlabeled[0]?.pctOfSupply ?? 0;
  const top10 = unlabeled.slice(0, 10).reduce((s, a) => s + a.pctOfSupply, 0);
  const status: SignalStatus = top1 > 25 || top10 > 50 ? "high" : top1 > 10 || top10 > 30 ? "caution" : "ok";
  const excluded = snapshot.accounts.length - unlabeled.length;
  return [
    {
      id: "concentration",
      label: "Top holder concentration",
      status,
      detail:
        `Largest unlabeled token account holds ${top1.toFixed(2)}% of supply; top 10 unlabeled accounts hold ${top10.toFixed(2)}%. ` +
        `${excluded} of the ${snapshot.accounts.length} largest accounts were excluded as liquidity pools or burn addresses. ` +
        "Unlabeled accounts may still be exchanges, lockers or unmatched pools.",
      why,
      source: `${SRC_RPC}: getTokenLargestAccounts (top ${snapshot.accounts.length} accounts only)`,
    },
  ];
}

export function liquiditySignals(pools: PoolSummary[], dexError?: string): RiskSignal[] {
  const why =
    "Low liquidity means even small trades move the price a lot, and liquidity providers can withdraw it, leaving holders unable to sell at a reasonable price.";
  if (dexError && pools.length === 0) {
    return [{ id: "liquidity", label: "Liquidity", status: "unknown", detail: `Market data unavailable: ${dexError}`, why, source: SRC_DEX }];
  }
  if (pools.length === 0) {
    return [{ id: "liquidity", label: "Liquidity", status: "high", detail: "No Solana trading pools found on DEX Screener.", why, source: SRC_DEX }];
  }
  const known = pools.map((p) => p.liquidityUsd).filter((v): v is number => v !== null);
  if (known.length === 0) {
    return [{ id: "liquidity", label: "Liquidity", status: "unknown", detail: `${pools.length} pool(s) found, but none report USD liquidity.`, why, source: SRC_DEX }];
  }
  const total = known.reduce((a, b) => a + b, 0);
  const status: SignalStatus = total < 10_000 ? "high" : total < 50_000 ? "caution" : "ok";
  return [
    {
      id: "liquidity",
      label: "Liquidity",
      status,
      detail: `$${Math.round(total).toLocaleString("en-US")} reported USD liquidity across ${known.length} pool(s). Thresholds used: under $10k high risk, under $50k caution.`,
      why,
      source: SRC_DEX,
    },
  ];
}

export function poolAgeSignals(pools: PoolSummary[], nowMs: number, dexError?: string): RiskSignal[] {
  const why = "Most rug pulls and pump-and-dumps happen shortly after a pool is created. Older pools have at least survived for a while.";
  if (dexError && pools.length === 0) {
    return [{ id: "pool-age", label: "Pool age", status: "unknown", detail: `Market data unavailable: ${dexError}`, why, source: SRC_DEX }];
  }
  const created = pools.map((p) => p.pairCreatedAt).filter((v): v is number => v !== null);
  if (created.length === 0) {
    return [{ id: "pool-age", label: "Pool age", status: "unknown", detail: "Pair creation time not reported.", why, source: SRC_DEX }];
  }
  const oldest = Math.min(...created);
  const hours = (nowMs - oldest) / 3_600_000;
  const status: SignalStatus = hours < 1 ? "high" : hours < 24 * 7 ? "caution" : "ok";
  const age = hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(0)} days`;
  return [
    {
      id: "pool-age",
      label: "Pool age",
      status,
      detail: `Oldest known pool was created ${age} ago (${new Date(oldest).toISOString()}).`,
      why,
      source: SRC_DEX,
    },
  ];
}

export function valuationSignals(marketCap: number | null, liquidityUsd: number | null, dexError?: string): RiskSignal[] {
  const why =
    "A market cap far larger than the liquidity behind it means the quoted valuation cannot actually be realised: selling even a small share of supply would crash the price.";
  if (dexError) {
    return [{ id: "mcap-liquidity", label: "Market cap vs. liquidity", status: "unknown", detail: `Market data unavailable: ${dexError}`, why, source: SRC_DEX }];
  }
  if (marketCap === null || liquidityUsd === null || liquidityUsd <= 0) {
    return [{ id: "mcap-liquidity", label: "Market cap vs. liquidity", status: "unknown", detail: "Market cap or liquidity not reported.", why, source: SRC_DEX }];
  }
  const ratio = marketCap / liquidityUsd;
  const status: SignalStatus = ratio > 50 ? "high" : ratio > 15 ? "caution" : "ok";
  return [
    {
      id: "mcap-liquidity",
      label: "Market cap vs. liquidity",
      status,
      detail: `Market cap is ${ratio.toFixed(1)}× the liquidity of its main pool.`,
      why,
      source: SRC_DEX,
    },
  ];
}

/** Checks we do not perform. Listed so their absence is never mistaken for a pass. */
export function notCheckedSignals(): RiskSignal[] {
  return [
    {
      id: "lp-lock",
      label: "Liquidity lock / LP burn",
      status: "unknown",
      detail: "Not checked. This app has no reliable free source for LP lock or burn status.",
      why: "Unlocked liquidity can be withdrawn by the pool creator at any time (a classic rug pull).",
      source: "Not available",
    },
    {
      id: "holder-count",
      label: "Holder count",
      status: "unknown",
      detail: "Not checked. Counting all holders requires an indexer; the public RPC only returns the 20 largest accounts.",
      why: "Very few holders can indicate an early, illiquid or manipulated market.",
      source: "Not available",
    },
    {
      id: "audit",
      label: "Audit / team verification",
      status: "unknown",
      detail: "Not checked. No audit or identity data is available.",
      why: "Anonymous teams and unaudited code offer no accountability if something goes wrong.",
      source: "Not available",
    },
  ];
}

export function summarize(signals: RiskSignal[]) {
  const count = (s: SignalStatus) => signals.filter((x) => x.status === s).length;
  return { high: count("high"), caution: count("caution"), unknown: count("unknown"), ok: count("ok") };
}
