import { describe, expect, it } from "vitest";
import {
  authoritySignals,
  concentrationSignals,
  extensionSignals,
  labelHolders,
  liquiditySignals,
  notCheckedSignals,
  parseMintAccount,
  poolAgeSignals,
  valuationSignals,
} from "@/lib/risk";
import { INCINERATOR_ADDRESS } from "@/lib/solana/address";
import { MINT_A, mintAccount, PAIR_1, PAIR_2, PAIR_3, SOL } from "../fixtures";

describe("mint parsing and authority checks", () => {
  it("reports revoked authorities as no issue found", () => {
    const info = parseMintAccount(mintAccount({}));
    expect(info?.decimals).toBe(6);
    const signals = authoritySignals(info);
    expect(signals.map((s) => s.status)).toEqual(["ok", "ok"]);
  });

  it("flags active mint and freeze authorities as high risk", () => {
    const info = parseMintAccount(mintAccount({ mintAuthority: PAIR_1, freezeAuthority: PAIR_2 }));
    const signals = authoritySignals(info);
    expect(signals.every((s) => s.status === "high")).toBe(true);
    expect(signals[0].detail).toContain(PAIR_1);
  });

  it("reports unknown, never ok, when the mint cannot be read", () => {
    expect(parseMintAccount({ data: { parsed: { type: "account" } } })).toBeNull();
    expect(authoritySignals(null, "RPC down").every((s) => s.status === "unknown")).toBe(true);
  });

  it("flags dangerous Token-2022 extensions", () => {
    const info = parseMintAccount(
      mintAccount(
        {
          extensions: [
            { extension: "permanentDelegate", state: { delegate: PAIR_3 } },
            { extension: "transferFeeConfig", state: { newerTransferFee: { transferFeeBasisPoints: 1000 } } },
            { extension: "defaultAccountState", state: { accountState: "frozen" } },
            { extension: "metadataPointer", state: {} },
          ],
        },
        "spl-token-2022",
      ),
    );
    const byId = Object.fromEntries(extensionSignals(info).map((s) => [s.id, s]));
    expect(byId["ext-permanentDelegate"].status).toBe("high");
    expect(byId["ext-transferFeeConfig"].status).toBe("high");
    expect(byId["ext-transferFeeConfig"].detail).toContain("10.00%");
    expect(byId["ext-defaultAccountState"].status).toBe("high");
    expect(byId["ext-metadataPointer"]).toBeUndefined();
  });
});

describe("holder concentration", () => {
  const supply = "1000000";
  it("excludes pool and burn accounts and labels them", () => {
    const largest = [
      { address: PAIR_3, amount: "500000" }, // owned by a pool
      { address: MINT_A, amount: "200000" }, // owned by the incinerator
      { address: SOL, amount: "120000" }, // unlabeled whale: 12%
    ];
    const holders = labelHolders(largest, { [PAIR_3]: PAIR_1, [MINT_A]: INCINERATOR_ADDRESS, [SOL]: PAIR_2 }, supply, [PAIR_1]);
    expect(holders.map((h) => h.label)).toEqual(["pool", "burn", null]);
    expect(holders[2].pctOfSupply).toBeCloseTo(12);
    const [signal] = concentrationSignals({ accounts: holders, supply, decimals: 6 });
    expect(signal.status).toBe("caution");
    expect(signal.detail).toContain("12.00%");
  });

  it("is unknown without data", () => {
    expect(concentrationSignals(null, "disabled")[0].status).toBe("unknown");
  });
});

describe("market signals", () => {
  const now = 1_800_000_000_000;
  it("grades liquidity with explicit thresholds", () => {
    expect(liquiditySignals([{ pairAddress: PAIR_1, liquidityUsd: 5_000, pairCreatedAt: null }])[0].status).toBe("high");
    expect(liquiditySignals([{ pairAddress: PAIR_1, liquidityUsd: 20_000, pairCreatedAt: null }])[0].status).toBe("caution");
    expect(liquiditySignals([{ pairAddress: PAIR_1, liquidityUsd: 200_000, pairCreatedAt: null }])[0].status).toBe("ok");
    expect(liquiditySignals([], "HTTP 500")[0].status).toBe("unknown");
    expect(liquiditySignals([])[0].status).toBe("high");
  });

  it("flags young pools", () => {
    expect(poolAgeSignals([{ pairAddress: PAIR_1, liquidityUsd: 1, pairCreatedAt: now - 10 * 60_000 }], now)[0].status).toBe("high");
    expect(poolAgeSignals([{ pairAddress: PAIR_1, liquidityUsd: 1, pairCreatedAt: now - 30 * 86_400_000 }], now)[0].status).toBe("ok");
    expect(poolAgeSignals([{ pairAddress: PAIR_1, liquidityUsd: 1, pairCreatedAt: null }], now)[0].status).toBe("unknown");
  });

  it("compares market cap with liquidity", () => {
    expect(valuationSignals(10_000_000, 100_000)[0].status).toBe("high");
    expect(valuationSignals(1_000_000, 100_000)[0].status).toBe("ok");
    expect(valuationSignals(null, 100_000)[0].status).toBe("unknown");
  });

  it("lists unchecked items as unknown and never uses the word safe", () => {
    expect(notCheckedSignals().every((s) => s.status === "unknown")).toBe(true);
    const all = [
      ...authoritySignals(parseMintAccount(mintAccount({}))),
      ...liquiditySignals([{ pairAddress: PAIR_1, liquidityUsd: 1e7, pairCreatedAt: null }]),
      ...notCheckedSignals(),
    ];
    for (const s of all) expect(`${s.label} ${s.detail}`.toLowerCase()).not.toMatch(/\bsafe\b/);
  });
});

describe("market data outages", () => {
  it("reports unknown (not 'not reported') when DEX Screener is down", () => {
    expect(poolAgeSignals([], Date.now(), "DEX Screener is unreachable.")[0]).toMatchObject({ status: "unknown", detail: expect.stringContaining("unavailable") });
    expect(valuationSignals(null, null, "DEX Screener is unreachable.")[0].detail).toContain("unavailable");
  });
});
