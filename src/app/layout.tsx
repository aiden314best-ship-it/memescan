import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MemeScan: Solana memecoin scanner", template: "%s · MemeScan" },
  description:
    "Scan Solana token pairs, check on-chain risk signals and swap through Jupiter with your own wallet. Data from DEX Screener, Jupiter and Solana RPC.",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `try{var p=JSON.parse(localStorage.getItem("memescan:prefs")||"{}");if(p.theme==="light")document.documentElement.classList.remove("dark");}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
