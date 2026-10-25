"use client";
import Link from "next/link";
import { useState } from "react";
import { DisconnectButton, WalletModal } from "@/components/wallet/WalletControls";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Card, CopyButton, ErrorBanner, ExtLink, Notice, PageHeader, Stat } from "@/components/ui";
import { getSolBalanceLamports, getTokenHoldings } from "@/lib/client/rpc";
import { formatAtomic } from "@/lib/solana/amounts";
import { formatTime } from "@/lib/format";
import { useAsync } from "@/lib/client/useApi";

export function WalletView() {
  const { account, wallets, walletOf } = useWallet();
  const [open, setOpen] = useState(false);
  const address = account?.address ?? null;
  const balances = useAsync(address, async () => {
    const [lamports, holdings] = await Promise.all([getSolBalanceLamports(address!), getTokenHoldings(address!)]);
    return { lamports, tokens: holdings.filter((h) => h.amount !== "0").length };
  });
  const state = {
    lamports: balances.data?.lamports ?? null,
    tokens: balances.data?.tokens ?? null,
    at: balances.updatedAt,
    error: balances.error,
    loading: balances.loading,
  };

  const wallet = account ? walletOf(account) : undefined;

  return (
    <>
      <PageHeader title="Wallet" subtitle="Connect a Solana wallet to see balances and sign swaps. Only your public address is shared with this site." />
      <div className="space-y-4">
        <Notice tone="warn" title="We will never ask for your seed phrase">
          This site cannot see or store your private key. Every transaction must be reviewed and approved in your own wallet. Anyone asking
          for your recovery phrase is trying to steal your funds.
        </Notice>

        {!account ? (
          <Card>
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted">
                {wallets.length > 0
                  ? `Detected ${wallets.length} compatible wallet${wallets.length > 1 ? "s" : ""}: ${wallets.map((w) => w.name).join(", ")}.`
                  : "No compatible Solana wallet detected yet. Install one (Phantom, Solflare, Backpack, ...) and reload, or use your wallet app's in-app browser on mobile."}
              </p>
              <button className="btn-primary" onClick={() => setOpen(true)}>
                Connect wallet
              </button>
            </div>
          </Card>
        ) : (
          <>
            <Card
              title={
                <span className="flex items-center gap-2">
                  {wallet && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={wallet.icon} alt="" width={20} height={20} className="rounded" />
                  )}
                  Connected{wallet ? ` via ${wallet.name}` : ""}
                </span>
              }
              actions={<DisconnectButton />}
            >
              <p className="text-xs text-muted">Public address</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-sm">{account.address}</code>
                <CopyButton value={account.address} />
                <ExtLink href={`https://solscan.io/account/${account.address}`} className="text-sm text-muted">
                  Solscan
                </ExtLink>
              </div>
            </Card>
            {state.error && <ErrorBanner message={state.error} onRetry={balances.refresh} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="SOL balance" value={state.lamports !== null ? `${formatAtomic(state.lamports, 9, 6)} SOL` : state.loading ? "Loading…" : "—"} />
              <Stat label="Token accounts with balance" value={state.tokens ?? (state.loading ? "Loading…" : "—")} sub={<Link href="/portfolio" className="hover:text-fg">View portfolio →</Link>} />
              <Stat
                label="Last read"
                value={state.at ? formatTime(state.at) : "—"}
                sub={
                  <button className="hover:text-fg" onClick={balances.refresh} disabled={state.loading}>
                    {state.loading ? "Refreshing…" : "Refresh"}
                  </button>
                }
              />
            </div>
            <p className="text-xs text-muted">Balances are read from the Solana RPC at &quot;confirmed&quot; commitment.</p>
          </>
        )}
      </div>
      <WalletModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
