import type { Metadata } from "next";
import { WalletView } from "./WalletView";

export const metadata: Metadata = { title: "Wallet" };

export default function Page() {
  return <WalletView />;
}
