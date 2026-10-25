// Browser end-to-end checks for the UI. NOT part of `npm test`.
//
//   1. Build and start the app:  npm run build && npm start   (or set BASE_URL)
//   2. Run:                      node tests/e2e/ui.e2e.mjs
//
// Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
//
// Part A hits the real server with no mocking (whatever upstream APIs are reachable).
// Part B replaces this app's /api/* responses with SYNTHETIC FIXTURES and injects a MOCK
// Wallet Standard wallet, so the UI flows (tables, wallet, quote review, signing, alerts)
// can be exercised without real funds or network access. No real transaction is sent.
import { createRequire } from "node:module";
import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getSignatureFromTransaction,
  getTransactionEncoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXECUTION_ENABLED = process.env.EXPECT_EXECUTION === "true";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT2 = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SOL = "So11111111111111111111111111111111111111112";
const PAIR = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
let failures = 0;
function check(cond, label) {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------- fixtures
function row(over = {}) {
  const now = Date.now();
  return {
    mint: MINT, name: "FIXTURE Alpha", symbol: "FXA", imageUrl: null, pairAddress: PAIR, dexId: "raydium",
    pairUrl: `https://dexscreener.com/solana/${PAIR}`, quoteSymbol: "SOL", quoteMint: SOL,
    priceUsd: 0.0123, priceNative: 0.00008, marketCap: 1_200_000, fdv: 1_300_000, liquidityUsd: 80_000,
    liquidityBase: 1_000_000, liquidityQuote: 250, volume: { m5: 100, h1: 2_000, h6: 9_000, h24: 40_000 },
    priceChange: { m5: 0.4, h1: -1.2, h6: 5, h24: 12.5 },
    txns: { m5: { buys: 3, sells: 1 }, h1: { buys: 30, sells: 20 }, h6: { buys: 90, sells: 70 }, h24: { buys: 400, sells: 300 } },
    pairCreatedAt: now - 5 * 3_600_000, labels: [], websites: [], socials: [], activeBoosts: 10, pairCount: 1, totalLiquidityUsd: 80_000,
    ...over,
  };
}
const ROWS = [row(), row({ mint: MINT2, name: "FIXTURE Beta", symbol: "FXB", liquidityUsd: 5_000, volume: { m5: 1, h1: 1, h6: 1, h24: 900_000 }, priceUsd: 0.5, marketCap: 50_000, pairCreatedAt: Date.now() - 40 * 3_600_000 })];
const meta = () => ({ fetchedAt: Date.now(), stale: false, dropped: 0, source: "FIXTURE" });

async function buildSwapTx(taker) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(taker.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"), lastValidBlockHeight: 100n }, m),
    (m) => appendTransactionMessageInstruction({ programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), data: new TextEncoder().encode("fixture") }, m),
  );
  const tx = compileTransaction(message);
  const signed = await partiallySignTransaction([taker.keyPair], tx);
  return {
    unsigned: Buffer.from(getTransactionEncoder().encode(tx)).toString("base64"),
    signed: Buffer.from(getTransactionEncoder().encode(signed)).toString("base64"),
    signature: getSignatureFromTransaction(signed),
  };
}

// ---------------------------------------------------------------- mock wallet (runs in page)
function mockWalletScript(cfg) {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const account = { address: cfg.address, publicKey: new Uint8Array(cfg.publicKey), chains: ["solana:mainnet"], features: ["solana:signTransaction"] };
  // Like real wallets, remember that this site was authorised across page reloads.
  const remembered = sessionStorage.getItem("mock-wallet-connected") === "1";
  const state = (window.__mockWallet = { rejectConnect: false, rejectSign: false, signCalls: 0, accounts: remembered ? [account] : [] });
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => l({ accounts: state.accounts }));
  const wallet = {
    version: "1.0.0",
    name: "Mock Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiM4YjZjZmYiLz48L3N2Zz4=",
    chains: ["solana:mainnet"],
    get accounts() {
      return state.accounts;
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          if (state.rejectConnect) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          state.accounts = [account];
          sessionStorage.setItem("mock-wallet-connected", "1");
          emit();
          return { accounts: state.accounts };
        },
      },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { state.accounts = []; sessionStorage.removeItem("mock-wallet-connected"); emit(); } },
      "standard:events": { version: "1.0.0", on: (_e, l) => { listeners.add(l); return () => listeners.delete(l); } },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs) => {
          state.signCalls++;
          if (state.rejectSign) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          return inputs.map(() => ({ signedTransaction: b64(cfg.signedTx) }));
        },
      },
    },
  };
  const callback = ({ register }) => register(wallet);
  class RegisterWalletEvent extends Event {
    #detail;
    get detail() { return this.#detail; }
    get type() { return "wallet-standard:register-wallet"; }
    constructor(cb) { super("wallet-standard:register-wallet", { bubbles: false, cancelable: false, composed: false }); this.#detail = cb; }
  }
  try { window.dispatchEvent(new RegisterWalletEvent(callback)); } catch (e) { console.error("mock wallet register failed", e); }
  window.addEventListener("wallet-standard:app-ready", ({ detail }) => callback(detail));
}

// ---------------------------------------------------------------- Part A
async function partA(browser) {
  console.log("\nPart A: real server, every page, desktop + phone");
  const routes = ["/", "/scanner", `/token/${MINT}`, `/risk?mint=${MINT}`, `/trade?mint=${MINT}`, "/portfolio", "/watchlist", "/wallet", "/settings", "/legal", "/token/notamint", "/missing-page"];
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const r of routes) {
      errors.length = 0;
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(errors.length === 0 && overflow <= 1, `${label} ${r} renders (overflow ${overflow}px${errors.length ? `, errors: ${errors.join("; ")}` : ""})`);
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Part B
async function partB(browser) {
  console.log(`\nPart B: mocked /api + mock wallet (execution ${EXECUTION_ENABLED ? "ENABLED" : "disabled"} build)`);
  const taker = await generateKeyPairSigner();
  const publicKey = [...getAddressEncoder().encode(taker.address)];
  const tx = await buildSwapTx(taker);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(mockWalletScript, { address: taker.address, publicKey, signedTx: tx.signed });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const calls = { execute: [], order: [] };
  let rows = ROWS;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/dex/listings") return json({ ...meta(), rows, listings: rows.map((r) => ({ mint: r.mint, boostAmount: 10, totalBoostAmount: 100, description: "", listingUrl: null, claimDate: null })), missingPairs: 0 });
    if (p === "/api/dex/tokens" || p === "/api/dex/search") return json({ ...meta(), rows });
    if (p.startsWith("/api/dex/token/")) return json({ ...meta(), row: rows[0], pools: [{ pairAddress: PAIR, dexId: "raydium", pairUrl: rows[0].pairUrl, baseSymbol: "FXA", quoteSymbol: "SOL", quoteMint: SOL, liquidityUsd: 80_000, volume24h: 40_000, priceUsd: 0.0123, pairCreatedAt: rows[0].pairCreatedAt, labels: [] }] });
    if (p === "/api/status") return json({ checkedAt: Date.now(), services: [], config: { rpcHost: "fixture", jupiterKeyConfigured: false, swapExecutionEnabled: EXECUTION_ENABLED } });
    if (p === "/api/prices") return json({ prices: { [SOL]: { usdPrice: 150, decimals: 9, priceChange24h: 1, blockId: 1 } }, fetchedAt: Date.now(), stale: false, source: "FIXTURE" });
    if (p === "/api/rpc") {
      const { method } = JSON.parse(route.request().postData());
      if (method === "getBalance") return json({ result: { context: { slot: 1 }, value: 2_000_000_000 } });
      if (method === "getAccountInfo") return json({ result: { value: { data: { program: "spl-token", parsed: { type: "mint", info: { decimals: 6, supply: "1000000000000" } } } } } });
      if (method === "getTokenAccountsByOwner") return json({ result: { value: [] } });
      if (method === "getSignatureStatuses") return json({ result: { value: [{ err: null, confirmationStatus: "confirmed" }] } });
      return json({ error: "unmocked" }, 500);
    }
    if (p === "/api/jupiter/order") {
      calls.order.push(Object.fromEntries(url.searchParams));
      const takerParam = url.searchParams.get("taker");
      return json({
        fetchedAt: Date.now(),
        order: {
          mode: "ultra", inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"),
          outAmount: "12000000", otherAmountThreshold: "11800000", slippageBps: 150, priceImpact: -0.42, inUsdValue: 15, outUsdValue: 14.9,
          routePlan: [{ swapInfo: { ammKey: PAIR, label: "Raydium", inputMint: SOL, outputMint: MINT, inAmount: "1", outAmount: "1" }, percent: 100, bps: 10000 }],
          feeBps: 10, feeMint: SOL, signatureFeeLamports: 5000, prioritizationFeeLamports: 10000, rentFeeLamports: 2039280, router: "metis",
          transaction: takerParam ? tx.unsigned : null, requestId: "fixture-request-1", taker: takerParam, gasless: false,
        },
      });
    }
    if (p === "/api/jupiter/execute") {
      calls.execute.push(JSON.parse(route.request().postData()));
      return json({ result: { status: "Success", code: 0, signature: tx.signature, totalInputAmount: "100000000", totalOutputAmount: "11950000", inputAmountResult: "100000000", outputAmountResult: "11950000" } });
    }
    return json({ error: `unmocked ${p}` }, 500);
  });

  // Dashboard: rows, sort, filter, favorite
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByText("FXA", { exact: true }).first().waitFor();
  check(await page.getByText("FXB", { exact: true }).first().isVisible(), "dashboard lists fixture rows");
  await shot(page, "mock-dashboard");
  const firstSymbol = () => page.locator("tbody tr").first().locator("td").nth(1).locator("span").first().textContent();
  check((await firstSymbol()) === "FXB", "default sort is 24h volume (FXB first)");
  await page.getByRole("button", { name: "Sort by Liquidity" }).click();
  check((await firstSymbol()) === "FXA", "clicking Liquidity header re-sorts (FXA first)");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByPlaceholder("e.g. 50k").fill("10k");
  check((await page.locator("tbody tr").count()) === 1, "min liquidity 10k filter hides low-liquidity token");
  await page.getByRole("button", { name: "Add FXA to favorites" }).click();
  check(await page.getByRole("button", { name: "Remove FXA from favorites" }).isVisible(), "favorite toggles on");
  check((await page.evaluate(() => localStorage.getItem("memescan:favorites"))).includes(MINT), "favorite persisted to localStorage");

  // Token page
  await page.goto(`${BASE}/token/${MINT}`, { waitUntil: "networkidle" });
  check(await page.getByText(MINT, { exact: true }).isVisible(), "token page shows mint address");
  check(await page.getByText(/Low liquidity, concentrated ownership and volatile prices/).isVisible(), "token page shows loss warning");
  check(await page.getByRole("link", { name: /Solscan/ }).first().isVisible(), "token page links to Solscan");
  await shot(page, "mock-token");
  if (SHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator("main ul li").first().waitFor();
    await shot(page, "mock-dashboard-phone");
    await page.setViewportSize({ width: 1366, height: 900 });
  }

  // Wallet: rejected, then connected, then disconnect
  await page.goto(`${BASE}/wallet`, { waitUntil: "networkidle" });
  await page.evaluate(() => (window.__mockWallet.rejectConnect = true));
  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /Mock Wallet/ }).click();
  check(await page.getByText("The request was rejected in your wallet").isVisible(), "rejected connection shows a clear message");
  await page.evaluate(() => (window.__mockWallet.rejectConnect = false));
  await page.getByRole("button", { name: /Mock Wallet/ }).click();
  await page.getByText(taker.address).waitFor();
  check(true, "connected wallet shows full public address");
  await page.getByText("2 SOL").first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText("2 SOL").first().isVisible(), "SOL balance read via RPC (2 SOL)");

  // Trade: quote, review, sign
  await page.goto(`${BASE}/trade?mint=${MINT}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("0.0").fill("0.1");
  await page.getByRole("button", { name: "Get quote" }).click();
  await page.getByText("Minimum received (after slippage)").waitFor();
  check(calls.order.at(-1)?.taker === taker.address && calls.order.at(-1)?.amount === "100000000", "quote request uses taker and 0.1 SOL = 100000000 lamports");
  check(await page.getByText("11.8 FXA").isVisible(), "review shows minimum received");
  check(await page.getByText("-0.42%").isVisible(), "review shows price impact");
  await shot(page, "mock-trade-review");
  check(await page.getByText("None", { exact: true }).isVisible(), "review shows no MemeScan fee");
  const signBtn = page.getByRole("button", { name: "Review in wallet & swap" });
  check(await signBtn.isDisabled(), "sign button disabled before risk acknowledgement");
  await page.getByText(/I reviewed this quote/).click();
  if (!EXECUTION_ENABLED) {
    check(await signBtn.isDisabled(), "quote-only build: sign button stays disabled");
    check(await page.getByText("Quote-only mode", { exact: true }).isVisible(), "quote-only notice shown");
    check((await page.evaluate(() => window.__mockWallet.signCalls)) === 0, "wallet never asked to sign");
  } else {
    await page.evaluate(() => (window.__mockWallet.rejectSign = true));
    await signBtn.click();
    await page.getByText("The request was rejected in your wallet").waitFor();
    check(calls.execute.length === 0, "rejected signature: nothing submitted");
    await page.evaluate(() => (window.__mockWallet.rejectSign = false));
    await signBtn.click();
    await page.getByText(/Swap confirmed/).waitFor({ timeout: 15000 });
    check(calls.execute.length === 1 && calls.execute[0].requestId === "fixture-request-1", "signed tx submitted once with requestId");
    check(calls.execute[0].signedTransaction === tx.signed, "submitted bytes are exactly what the wallet signed");
    check(await page.getByRole("link", { name: "View transaction on Solscan" }).isVisible(), "confirmation links to Solscan");
    check((await page.evaluate(() => localStorage.getItem("memescan:swaps"))).includes(tx.signature), "confirmed swap logged locally");
  }

  // Alerts fire from mocked data while the page is open
  await page.goto(`${BASE}/watchlist?mint=${MINT}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("0.0012").fill("0.01");
  await page.getByRole("button", { name: "Add alert" }).click();
  await page.getByText(/FXA price is above/).waitFor({ timeout: 15000 }).catch(() => {});
  check(await page.getByText(/FXA price is above/).first().isVisible(), "alert fired as in-page toast");
  check(await page.getByText("Re-arm").isVisible(), "triggered alert disabled itself (Re-arm offered)");
  check(await page.getByText(/only work while this site is open/).isVisible(), "alert limitation is explained");

  // Settings: theme + slippage validation
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  check(!(await page.evaluate(() => document.documentElement.classList.contains("dark"))), "light theme applied");
  await page.getByLabel("Custom slippage percent").fill("40");
  check(await page.getByText(/Slippage must be between/).isVisible(), "slippage above 30% rejected");
  await page.getByLabel("Custom slippage percent").fill("8");
  check(await page.getByText(/High slippage/).first().isVisible(), "high slippage warning shown");

  // Disconnect
  await page.goto(`${BASE}/wallet`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Disconnect" }).click();
  check(await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).isVisible(), "disconnect returns to connect state");
  check(pageErrors.length === 0, `no uncaught page errors${pageErrors.length ? `: ${pageErrors.join("; ")}` : ""}`);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  if (!process.env.SKIP_A) await partA(browser);
  await partB(browser);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
