import type { Metadata } from "next";

export const metadata: Metadata = { title: "Risk disclosure, privacy & docs" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Risk disclosure, privacy &amp; documentation</h1>

      <Section id="risk" title="Risk disclosure">
        <p>
          <strong className="text-fg">Memecoins are highly speculative and most lose most or all of their value.</strong> Anyone can create a Solana
          token with any name, ticker or logo in minutes. Impersonation, rug pulls (liquidity removal), pump-and-dump schemes, hidden mint or freeze
          powers and tokens that cannot be sold are common.
        </p>
        <p>
          Low liquidity, concentrated ownership and volatile prices can create substantial losses. Blockchain transactions are irreversible: if you
          send funds to the wrong token or a scam, they cannot be recovered.
        </p>
        <p>
          The risk checker reports individual signals from on-chain data and DEX Screener. It does not and cannot certify any token as safe. &quot;No
          issue found&quot; for one check says nothing about the risks that are not checked. Market data may be delayed, incomplete or wrong.
        </p>
        <p>Nothing on this site is investment, financial, legal or tax advice. You are solely responsible for your trades.</p>
      </Section>

      <Section id="privacy" title="Privacy">
        <ul className="list-disc space-y-1 pl-5">
          <li>No account, email or sign-up. No analytics or tracking scripts are included in this app.</li>
          <li>
            Connecting a wallet shares only your <em>public</em> address. This app never requests, receives or stores seed phrases or private keys.
          </li>
          <li>
            Preferences, favorites, alert rules and your log of swaps confirmed here are saved in your browser&apos;s local storage only. Clear them in
            Settings.
          </li>
          <li>
            To fetch data, this app&apos;s server contacts DEX Screener, Jupiter and a Solana RPC provider. Your public wallet address is sent to the
            RPC provider (to read balances) and to Jupiter (to build swap transactions). Those services have their own privacy policies.
          </li>
          <li>Loading the optional price chart embeds a page from dexscreener.com, which may set its own cookies.</li>
          <li>The hosting provider of this site may keep standard server logs (IP address, requested URLs).</li>
        </ul>
      </Section>

      <Section id="docs" title="How this app works">
        <p>
          <strong className="text-fg">Market data</strong> comes from the public DEX Screener API (token profiles, boosts, community takeovers, token
          pairs and search). The server validates every response, drops malformed items, caches results for 30–60 seconds, throttles requests below
          the published limits, and serves the last good data marked <em>STALE</em> if the API fails. Missing values are shown as &quot;—&quot;,
          never as zero.
        </p>
        <p>
          <strong className="text-fg">On-chain checks</strong> use Solana JSON-RPC: mint and freeze authority, Token-2022 extensions, and the 20 largest
          token accounts (labelled when they match a known pool or burn address).
        </p>
        <p>
          <strong className="text-fg">Swaps</strong> use Jupiter&apos;s Swap API V2 (<code>/swap/v2/order</code> and <code>/swap/v2/execute</code>).
          Jupiter builds the transaction; your wallet signs it after you review it; Jupiter submits it; this app then confirms the signature on-chain
          before reporting success. This app adds no fee of its own. Jupiter&apos;s own fee is shown in each quote.
        </p>
        <p>
          <strong className="text-fg">Portfolio</strong> balances come from Solana RPC and USD values from the Jupiter Price API. Profit and loss is not
          calculated because reliable cost-basis data is not available.
        </p>
        <p>
          <strong className="text-fg">Alerts</strong> run in your browser while the site is open. They are not delivered when the site is closed.
        </p>
        <p>See the project README for installation, configuration and deployment instructions.</p>
      </Section>
    </div>
  );
}
