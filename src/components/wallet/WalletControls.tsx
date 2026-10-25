"use client";
import { useConnect, useDisconnect, type UiWallet, type UiWalletAccount } from "@wallet-standard/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "./WalletProvider";
import { IconClose, IconWallet } from "@/components/icons";
import { shortAddress } from "@/lib/solana/address";

export function describeWalletError(error: unknown): string {
  const e = error as { code?: number; name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (e?.code === 4001 || text.includes("reject") || text.includes("denied") || text.includes("cancel")) {
    return "The request was rejected in your wallet. Nothing was changed.";
  }
  return e?.message ? `Wallet error: ${e.message.slice(0, 200)}` : "The wallet returned an unknown error.";
}

function WalletOption({ wallet, onConnected, onError }: { wallet: UiWallet; onConnected: (a: UiWalletAccount) => void; onError: (m: string) => void }) {
  const [isConnecting, connect] = useConnect(wallet);
  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-left hover:border-accent disabled:opacity-60"
      disabled={isConnecting}
      onClick={async () => {
        try {
          const accounts = await connect();
          const account = accounts.find((a) => a.chains.includes("solana:mainnet")) ?? accounts[0];
          if (!account) onError("The wallet did not authorise any Solana account.");
          else onConnected(account);
        } catch (err) {
          onError(describeWalletError(err));
        }
      }}
    >
      {/* Wallet icons are data: URIs supplied by the installed wallet extension. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wallet.icon} alt="" width={28} height={28} className="rounded-md" />
      <span className="flex-1 font-medium">{wallet.name}</span>
      <span className="text-xs text-muted">{isConnecting ? "Check your wallet…" : "Connect"}</span>
    </button>
  );
}

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, setAccount } = useWallet();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body>: the header's backdrop blur would otherwise become the containing
  // block for this fixed overlay and squash it into the header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        className="card w-full max-w-md rounded-b-none p-5 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect a Solana wallet</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
            <IconClose />
          </button>
        </div>
        {wallets.length === 0 ? (
          <div className="space-y-2 text-sm text-muted">
            <p>No compatible wallet was detected in this browser.</p>
            <p>
              Install a Wallet Standard compatible Solana wallet (for example Phantom, Solflare or Backpack) from its official
              website, then reload this page. On a phone, open this site inside your wallet app&apos;s built-in browser.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <WalletOption
                key={w.name}
                wallet={w}
                onError={setError}
                onConnected={(a) => {
                  setError(null);
                  setAccount(a);
                  onClose();
                }}
              />
            ))}
          </div>
        )}
        {error && <p className="mt-3 rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}
        <p className="mt-4 text-xs text-muted">
          Connecting shares only your public address. This site will <strong>never</strong> ask for your seed phrase or private
          key. If anything does, it is a scam.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function DisconnectInner({ wallet, onDone }: { wallet: UiWallet; onDone: () => void }) {
  const [isDisconnecting, disconnect] = useDisconnect(wallet);
  return (
    <button
      className="btn-ghost"
      disabled={isDisconnecting}
      onClick={async () => {
        try {
          await disconnect();
        } catch {
          // Some wallets do not implement standard:disconnect; clearing our selection is enough.
        }
        onDone();
      }}
    >
      {isDisconnecting ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}

export function DisconnectButton() {
  const { account, walletOf, setAccount } = useWallet();
  if (!account) return null;
  const wallet = walletOf(account);
  if (!wallet || !wallet.features.includes("standard:disconnect")) {
    return (
      <button className="btn-ghost" onClick={() => setAccount(undefined)}>
        Disconnect
      </button>
    );
  }
  return <DisconnectInner wallet={wallet} onDone={() => setAccount(undefined)} />;
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { account } = useWallet();
  const [open, setOpen] = useState(false);
  return (
    <>
      {account ? (
        <Link href="/wallet" className="btn-ghost tabular" title={account.address}>
          <span className="h-2 w-2 rounded-full bg-up" aria-hidden />
          {shortAddress(account.address)}
        </Link>
      ) : (
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <IconWallet width={16} height={16} />
          {compact ? "Connect" : "Connect wallet"}
        </button>
      )}
      <WalletModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
