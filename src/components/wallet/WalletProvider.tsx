"use client";
// Wallet connection via the Wallet Standard (@wallet-standard/react + @solana/react).
// Any installed wallet that registers itself with the standard (Phantom, Solflare,
// Backpack, etc.) is discovered automatically. This app never sees private keys:
// all signing happens inside the user's wallet.
import { SelectedWalletAccountContextProvider, useSelectedWalletAccount } from "@solana/react";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react";
import type { ReactNode } from "react";

export const SOLANA_CHAIN = "solana:mainnet" as const;
const STORAGE_KEY = "memescan:selected-wallet-account";

/** Wallets usable here: Solana mainnet, connectable, and able to sign transactions. */
export function isSupportedWallet(wallet: UiWallet): boolean {
  return (
    wallet.chains.includes(SOLANA_CHAIN) &&
    wallet.features.includes("standard:connect") &&
    wallet.features.includes("solana:signTransaction")
  );
}

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <SelectedWalletAccountContextProvider
      filterWallets={isSupportedWallet}
      stateSync={{
        // Only "walletName:publicAddress" is stored, to restore the selection on reload.
        getSelectedWallet: () => safeStorage(() => localStorage.getItem(STORAGE_KEY), null),
        storeSelectedWallet: (key) => safeStorage(() => localStorage.setItem(STORAGE_KEY, key), undefined),
        deleteSelectedWallet: () => safeStorage(() => localStorage.removeItem(STORAGE_KEY), undefined),
      }}
    >
      {children}
    </SelectedWalletAccountContextProvider>
  );
}

export function useWallet(): {
  account: UiWalletAccount | undefined;
  wallets: readonly UiWallet[];
  setAccount: (a: UiWalletAccount | undefined) => void;
  walletOf: (a: UiWalletAccount) => UiWallet | undefined;
} {
  const [account, setAccount, wallets] = useSelectedWalletAccount();
  const walletOf = (a: UiWalletAccount) => wallets.find((w) => w.accounts.some((x) => x.address === a.address));
  return { account, wallets, setAccount, walletOf };
}
