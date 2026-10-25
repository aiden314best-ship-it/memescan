"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AlertEngine } from "./AlertEngine";
import {
  IconBell,
  IconClose,
  IconDashboard,
  IconMenu,
  IconMoon,
  IconPie,
  IconRadar,
  IconSettings,
  IconShield,
  IconSun,
  IconSwap,
  IconWallet,
} from "./icons";
import { ToastProvider } from "./Toasts";
import { WalletButton } from "./wallet/WalletControls";
import { WalletProvider } from "./wallet/WalletProvider";
import { prefsStore } from "@/lib/client/stores";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/scanner", label: "Scanner", icon: IconRadar },
  { href: "/risk", label: "Risk checker", icon: IconShield },
  { href: "/trade", label: "Trade", icon: IconSwap },
  { href: "/portfolio", label: "Portfolio", icon: IconPie },
  { href: "/watchlist", label: "Watchlist & alerts", icon: IconBell },
  { href: "/wallet", label: "Wallet", icon: IconWallet },
  { href: "/settings", label: "Settings", icon: IconSettings },
];
// Bottom bar on phones shows the most used destinations; the rest live in the drawer.
const MOBILE_TABS = ["/", "/scanner", "/trade", "/portfolio", "/watchlist"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeSync() {
  const [prefs] = prefsStore.useStore();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", prefs.theme === "dark");
  }, [prefs.theme]);
  return null;
}

export function ThemeToggle() {
  const [prefs, setPrefs] = prefsStore.useStore();
  const dark = prefs.theme === "dark";
  return (
    <button
      className="btn-ghost px-2.5"
      onClick={() => setPrefs((p) => ({ ...p, theme: dark ? "light" : "dark" }))}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
    </button>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-fg">MS</span>
      <span>MemeScan</span>
    </Link>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-panel-2 font-medium text-fg" : "text-muted hover:bg-panel-2 hover:text-fg"
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileTabs({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV.filter((n) => MOBILE_TABS.includes(n.href)).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-accent" : "text-muted"}`}>
            <Icon />
            {label.split(" ")[0]}
          </Link>
        );
      })}
    </>
  );
}

// usePathname() is runtime data; isolating it behind Suspense keeps every page's shell prerenderable.
function ActiveNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}
function ActiveTabs() {
  return <MobileTabs pathname={usePathname()} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const navLinks = (
    <Suspense fallback={<NavList pathname="" />}>
      <ActiveNav onNavigate={() => setDrawer(false)} />
    </Suspense>
  );

  return (
    <WalletProvider>
      <ToastProvider>
        <ThemeSync />
        <AlertEngine />
        <div className="min-h-dvh lg:pl-60">
          {/* Desktop sidebar */}
          <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-panel px-3 py-4 lg:flex">
            <div className="mb-6 px-2">
              <Brand />
            </div>
            {navLinks}
            <div className="mt-auto space-y-2 px-2 text-xs text-muted">
              <Link href="/legal" className="block hover:text-fg">
                Risk disclosure &amp; privacy
              </Link>
              <p>Data: DEX Screener, Jupiter, Solana RPC. Not financial advice.</p>
            </div>
          </aside>

          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur">
            <button className="text-muted hover:text-fg lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <IconMenu />
            </button>
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <WalletButton compact />
            </div>
          </header>

          {/* Mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
              <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-panel px-3 py-4">
                <div className="mb-6 flex items-center justify-between px-2">
                  <Brand />
                  <button onClick={() => setDrawer(false)} aria-label="Close menu" className="text-muted">
                    <IconClose />
                  </button>
                </div>
                {navLinks}
                <Link href="/legal" onClick={() => setDrawer(false)} className="mt-auto px-3 text-xs text-muted">
                  Risk disclosure &amp; privacy
                </Link>
              </div>
            </div>
          )}

          <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>

          {/* Mobile bottom tabs */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
            <Suspense fallback={<MobileTabs pathname="" />}>
              <ActiveTabs />
            </Suspense>
          </nav>
        </div>
      </ToastProvider>
    </WalletProvider>
  );
}
