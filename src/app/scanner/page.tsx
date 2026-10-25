import type { Metadata } from "next";
import { ScannerView } from "./ScannerView";

export const metadata: Metadata = { title: "Scanner" };

export default function Page() {
  return <ScannerView />;
}
