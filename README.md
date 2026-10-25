# MemeScan: Solana memecoin scanner & swap terminal

A dark-mode, responsive Solana token scanner with on-chain risk checks, a wallet-standard wallet connection, a portfolio view, browser alerts and user-signed swaps through Jupiter. Everything runs on free tiers with no database, no paid API, and no account.

> **Risk warning.** Memecoins are extremely risky and most lose most or all of their value. Nothing here is financial advice. The risk checker cannot prove a token is safe.

## Features

| Page | What it does | Data source |
| --- | --- | --- |
| **Dashboard** `/` | Most/recently boosted Solana tokens on DEX Screener, plus search across all Solana pairs. Price, market cap/FDV, liquidity, volume, buys/sells, 1h/24h change, pair age, favorites, sort, filters, links to DEX Screener and Solscan, data timestamps and STALE labels. | DEX Screener `token-boosts`, `tokens/v1`, `latest/dex/search`, `token-pairs/v1` |
| **Scanner** `/scanner` | Newly profiled, newly boosted and community-takeover tokens, newest pairs first. Filters for min liquidity, market-cap range, min volume, max age and 24h change range; sort by volume, liquidity, market cap, etc. | DEX Screener `token-profiles/latest`, `token-boosts/latest`, `community-takeovers/latest` |
| **Token details** `/token/<mint>` | Stats, buy/sell activity per window, price change bars, all liquidity pools with creation time, optional embedded DEX Screener price chart, copyable mint, loss warning. | DEX Screener |
| **Risk checker** `/risk?mint=<mint>` | Mint authority, freeze authority, risky Token-2022 extensions (permanent delegate, transfer hook/fee, default-frozen, pausable…), top-20 token accounts with pool/burn labelling, liquidity, pool age, market cap vs liquidity, liquidity change observed in this browser, optional Jupiter sell-route quote. Every signal explains why it matters, and anything unverifiable is shown as **Unknown**. No score, no "safe" label. | Solana RPC, DEX Screener, Jupiter |
| **Wallet** `/wallet` | Connect/disconnect any Wallet Standard wallet (Phantom, Solflare, Backpack, …), public address, SOL balance, handling of rejected connections. | Wallet Standard, Solana RPC |
| **Trade** `/trade?mint=<mint>` | SOL → token and token → SOL quotes with estimated output, minimum received, slippage, price impact, route, router, network costs, Jupiter's fee, and quote age/expiry. Balance and fee pre-checks, a risk acknowledgement, and wallet signing, followed by on-chain confirmation before success is shown. **Quote-only by default** (see below). | Jupiter Swap API V2 |
| **Portfolio** `/portfolio` | SPL + Token-2022 holdings and current USD value where Jupiter has a reliable price. P/L is explicitly *unavailable* (no cost basis), plus a log of swaps confirmed through this browser. | Solana RPC, Jupiter Price API V3, DEX Screener |
| **Watchlist & alerts** `/watchlist` | Favorites with live data; price / market-cap above/below alerts, checked every 60 s while the site is open (in-page toast + optional browser notification). | DEX Screener |
| **Settings** `/settings` | Dark/light theme, slippage (auto or 0.01–30 % with warnings), refresh interval, live network status, clearing local data, links to the risk disclosure, privacy and docs (`/legal`). | |

## Requirements

- **Node.js 20.9+** (developed with Node 22) and npm.
- A Solana wallet browser extension to connect and sign (optional for browsing).
- Internet access to `api.dexscreener.com`, `api.jup.ag` and your Solana RPC.

No accounts, keys or payments are required to run it.

## Install and run locally

```bash
cd memescan
npm install
cp .env.example .env.local     # optional: every variable has a working default
npm run dev                    # http://localhost:3000
```

Production mode:

```bash
npm run build
npm start                      # http://localhost:3000
```

## Configuration (`.env.local`)

| Variable | Default | Notes |
| --- | --- | --- |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Server-side only. The public endpoint is free but heavily rate-limited (risk checks may show "Unknown" when it throttles `getTokenLargestAccounts`). For reliability, paste the URL from a free-tier RPC provider. Any key in it stays on the server. |
| `RPC_REQUESTS_PER_MINUTE` | `90` | Server-side throttle for RPC calls. |
| `JUPITER_API_KEY` | *(unset)* | Optional free key from the [Jupiter Developer Portal](https://developers.jup.ag/portal) (free tier, no payment). Without it Jupiter's keyless tier applies (0.5 requests/second shared by everyone using your server), which is fine for local use. Sent only from the server in `x-api-key`. |
| `NEXT_PUBLIC_ENABLE_SWAP_EXECUTION` | `false` | Must be exactly `true` to allow signing and submitting swaps. Applied at **build** time (restart `npm run dev`, or rebuild for production). |

## Enabling swaps

Real-money execution is **off by default**, so a fresh install can never trade by accident.

**Live test (Oct 25, 2026):** on Windows with Chrome and Phantom, a small swap of 0.02 SOL → USDC and a sale of that USDC back to SOL both completed and showed as confirmed. Live DEX Screener data, Jupiter quotes and RPC balance reads also worked. That is one small test with one wallet, not a guarantee. Keep amounts small, especially with low-liquidity tokens.

Automated checks also cover:

- Unit tests of request validation, response parsing, error-code mapping and fee/cost math, using the request/response schema from Jupiter's official Swap V2 OpenAPI spec.
- Transaction-inspection tests on real transactions built and signed with `@solana/kit`.
- A browser test with a mock Wallet Standard wallet and mocked API responses, covering: a rejected signature submits nothing; an approved signature submits exactly the wallet-signed bytes once; success is shown only after the signature is confirmed on-chain.

To turn swaps on for one session (Windows Command Prompt), stop the app with Ctrl + C, then run:

```
set "NEXT_PUBLIC_ENABLE_SWAP_EXECUTION=true"
npm run dev
```

To keep them on permanently, put `NEXT_PUBLIC_ENABLE_SWAP_EXECUTION=true` in `.env.local` and restart (rebuild for production).

If you deploy somewhere new or change wallets, repeat a small test first:

1. Set `NEXT_PUBLIC_ENABLE_SWAP_EXECUTION=true` in `.env.local` and restart.
2. Use a **fresh wallet funded with a few dollars of SOL**.
3. Quote and buy a liquid, well-known token (for example USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) for about 0.01 SOL. Check that the amount your wallet shows matches the review panel, and that the transaction appears on Solscan.
4. Sell it back to SOL from the Portfolio page's **Sell** link.
5. Try rejecting a signature in the wallet, and waiting more than 30 s before signing (the app should require a fresh quote).

How a swap works: `GET /api/jupiter/order` → Jupiter `GET /swap/v2/order` builds an unsigned transaction for your address. The app decodes it and checks that your wallet is a required signer, then shows the review panel. You tick the acknowledgement and press **Review in wallet & swap**, and your wallet shows the transaction for approval (`solana:signTransaction`). The signed transaction goes to `POST /api/jupiter/execute` → Jupiter `POST /swap/v2/execute`. The app then checks the signature with `getSignatureStatuses` and reports success only at `confirmed` or `finalized` commitment.

The app never sees your private key, never signs on the server, adds **no platform fee** (no referral parameters are sent), and shows Jupiter's own fee from the quote.

## Testing

```bash
npm run lint         # ESLint (next/core-web-vitals + TypeScript rules)
npm run typecheck    # Next route typegen + tsc --noEmit
npm test             # Vitest: 79 unit and API-route tests, network fully mocked
npm run build        # production build
npm run check        # all of the above in sequence
```

Optional browser end-to-end checks (Playwright + Chromium):

```bash
npm i -D playwright && npx playwright install chromium   # one-time
npm run build && npm start &                             # app on :3000
node tests/e2e/ui.e2e.mjs                                # quote-only build
# To exercise the signing flow (still fully mocked, no real funds):
NEXT_PUBLIC_ENABLE_SWAP_EXECUTION=true npm run build && npm start &
EXPECT_EXECUTION=true node tests/e2e/ui.e2e.mjs
```

Part A loads every page at desktop and phone widths against the real server and checks for uncaught errors and horizontal overflow. Part B mocks this app's `/api/*` with clearly labelled *FIXTURE* data and injects a mock wallet to test sorting, filters, favorites, wallet connect/reject/disconnect, quote review, signing, alerts and settings.

## Deployment (free options)

The app is a standard Next.js server (API routes are required, so a static export won't work).

- **Vercel (Hobby, free):** import the repository, set the environment variables in Project Settings → Environment Variables, deploy. Note: `/api/jupiter/execute` can wait up to ~75 s for Jupiter to confirm; if your plan's function timeout is shorter, the UI falls back to checking the signature on-chain.
- **Any Node host** (a free-tier VM, Render, Fly.io, Railway, a home server): `npm ci && npm run build && npm start` behind HTTPS. Set `PORT` to change the port.

Caching and throttling are in-memory per server instance, which is fine for small deployments. If you expose the site publicly, get a free `JUPITER_API_KEY` and your own RPC URL, because the keyless Jupiter tier and public RPC are shared by all your visitors.

## Architecture & security notes

```
src/
  app/                    pages (client views) + API route handlers
    api/dex/*             DEX Screener proxy: validated, cached (30–60 s), throttled
    api/jupiter/*         Jupiter Swap V2 order/execute proxy (keeps the API key server-side)
    api/prices            Jupiter Price API V3
    api/risk/[mint]       on-chain + market risk signals
    api/rpc               read-only RPC proxy (allow-listed methods only; cannot send transactions)
    api/status            upstream health checks
  components/             UI kit, token table, wallet controls, alert engine
  lib/                    pure logic (validation, normalisation, filters, risk, Jupiter, formatting)
tests/                    Vitest unit + route tests, Playwright e2e script
```

- **Untrusted data:** all external JSON is validated with zod; malformed items are dropped and counted, never guessed at. Token names and descriptions are stripped of control/bidi characters and rendered as plain text (React escaping; no `dangerouslySetInnerHTML` for external content). Only `http(s)` links are shown, and token images are only loaded from DEX Screener's CDN hosts.
- **Missing data** is shown as "—" or "Unknown", never as 0. When an upstream fails, the last good response is served labelled **STALE** with its timestamp. With no cached data, an error is shown instead.
- **Rate limits:** DEX Screener is held to 50 req/min (profile/boost endpoints, limit 60) and 250 req/min (pair endpoints, limit 300); Jupiter to 28 req/min keyless or 55 with a key; each client IP to 240 req/min across this app's API.
- **Wallet safety:** no seed phrase or private key is ever requested, stored or handled. Only the selected wallet name and public address are kept in `localStorage`. Every transaction requires an explicit click and wallet approval, and nothing is auto-executed.
- **Headers:** CSP (`connect-src 'self'`, frames only from dexscreener.com, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive Permissions-Policy.

## Known limitations

- DEX Screener's public API has no "all new pairs" or "trending" feed. The dashboard and scanner use profile/boost/takeover lists, which only cover tokens whose teams interacted with DEX Screener. Boosts are paid promotions.
- No OHLC history endpoint is available on the free API, so price history is shown with DEX Screener's embeddable chart (loaded only when you click), plus per-window change bars.
- Holder count, LP lock/burn status and audits are **not checked** (no reliable free source), and the UI says so.
- Liquidity *change* is based on what this browser observed on earlier checks, not a full history.
- Alerts only run while a MemeScan tab is open; there is no server or push delivery.
- Mobile wallets: open the site in your wallet app's built-in browser (Phantom, Solflare, Backpack). Wallet Standard injection is not available in plain mobile Safari or Chrome.
- If your machine reaches the internet through an HTTP proxy, Node's built-in `fetch` needs `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) to use it.
