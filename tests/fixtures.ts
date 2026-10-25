// TEST FIXTURES ONLY. Synthetic API-shaped objects for unit tests; never used by the app.
// Field names follow the DEX Screener pair schema. Values are arbitrary.

export const MINT_A = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const MINT_B = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const SOL = "So11111111111111111111111111111111111111112";
export const PAIR_1 = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";
export const PAIR_2 = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
export const PAIR_3 = "7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm";

export function rawPair(overrides: Record<string, unknown> = {}) {
  return {
    chainId: "solana",
    dexId: "raydium",
    url: `https://dexscreener.com/solana/${PAIR_1.toLowerCase()}`,
    pairAddress: PAIR_1,
    baseToken: { address: MINT_A, name: "Test Token", symbol: "TEST" },
    quoteToken: { address: SOL, name: "Wrapped SOL", symbol: "SOL" },
    priceNative: "0.0001",
    priceUsd: "0.015",
    txns: { m5: { buys: 1, sells: 2 }, h1: { buys: 10, sells: 5 }, h6: { buys: 50, sells: 40 }, h24: { buys: 200, sells: 150 } },
    volume: { m5: 100, h1: 1000, h6: 5000, h24: 20000 },
    priceChange: { m5: 0.5, h1: -2, h6: 10, h24: 25 },
    liquidity: { usd: 50000, base: 1000000, quote: 150 },
    fdv: 1500000,
    marketCap: 1200000,
    pairCreatedAt: 1_700_000_000_000,
    info: {
      imageUrl: "https://dd.dexscreener.com/ds-data/tokens/solana/test.png",
      websites: [{ label: "Website", url: "https://example.com" }, { label: "bad", url: "javascript:alert(1)" }],
      socials: [{ type: "twitter", url: "https://x.com/test" }],
    },
    ...overrides,
  };
}

export function mintAccount(info: Record<string, unknown>, program = "spl-token") {
  return {
    owner: program === "spl-token" ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" : "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    data: {
      program,
      parsed: {
        type: "mint",
        info: { decimals: 6, supply: "1000000000000", isInitialized: true, mintAuthority: null, freezeAuthority: null, ...info },
      },
    },
  };
}

/** Shape of a Jupiter /swap/v2/order response (fields per the official OpenAPI spec). */
export function orderResponse(overrides: Record<string, unknown> = {}) {
  return {
    mode: "ultra",
    inputMint: SOL,
    outputMint: MINT_A,
    inAmount: "100000000",
    outAmount: "6500000",
    inUsdValue: 15,
    outUsdValue: 14.9,
    priceImpact: -0.3,
    otherAmountThreshold: "6400000",
    swapMode: "ExactIn",
    slippageBps: 150,
    routePlan: [
      { swapInfo: { ammKey: PAIR_1, label: "Raydium", inputMint: SOL, outputMint: MINT_A, inAmount: "100000000", outAmount: "6500000" }, percent: 100, bps: 10000 },
    ],
    feeMint: SOL,
    feeBps: 10,
    platformFee: { amount: "100000", feeBps: 10, feeMint: SOL },
    signatureFeeLamports: 5000,
    signatureFeePayer: null,
    prioritizationFeeLamports: 10000,
    prioritizationFeePayer: null,
    rentFeeLamports: 2039280,
    rentFeePayer: null,
    router: "metis",
    transactionVersion: 0,
    transaction: null,
    lastValidBlockHeight: "300000000",
    gasless: false,
    requestId: "019a1b2c-3d4e-7f00-8000-abcdefabcdef",
    taker: null,
    ...overrides,
  };
}
