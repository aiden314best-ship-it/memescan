"use client";
import { useState, type ReactNode } from "react";
import { IconAlert, IconCopy, IconExternal, IconInfo, IconRefresh } from "./icons";
import { formatAge } from "@/lib/format";
import { useNow } from "@/lib/client/useApi";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-sm">
      <IconAlert className="mt-0.5 shrink-0 text-down" />
      <div className="flex-1">
        <p className="font-medium text-fg">Data unavailable</p>
        <p className="text-muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-ghost shrink-0 py-1" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger"; title?: string; children: ReactNode }) {
  const styles = {
    info: "border-line bg-panel-2",
    warn: "border-warn/40 bg-warn/10",
    danger: "border-down/40 bg-down/10",
  }[tone];
  const iconColor = { info: "text-muted", warn: "text-warn", danger: "text-down" }[tone];
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {tone === "info" ? <IconInfo className={`mt-0.5 shrink-0 ${iconColor}`} /> : <IconAlert className={`mt-0.5 shrink-0 ${iconColor}`} />}
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton hidden h-4 w-24 sm:block" />
          <div className="skeleton hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

/** Shows when data was fetched and flags it as stale. */
export function Freshness({
  fetchedAt,
  stale,
  staleReason,
  staleAfterMs = 120_000,
  source,
  onRefresh,
  loading,
}: {
  fetchedAt: number | null | undefined;
  stale?: boolean;
  staleReason?: string;
  staleAfterMs?: number;
  source?: string;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  const now = useNow(5000);
  const old = fetchedAt ? now - fetchedAt > staleAfterMs : false;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {fetchedAt ? (
        <span title={new Date(fetchedAt).toLocaleString()}>
          Data fetched {formatAge(fetchedAt, now)} ago
        </span>
      ) : (
        <span>No data yet</span>
      )}
      {(stale || old) && (
        <span className="rounded bg-warn/15 px-1.5 py-0.5 font-medium text-warn" title={staleReason}>
          STALE{stale && staleReason ? `: ${staleReason}` : ""}
        </span>
      )}
      {source && <span className="hidden sm:inline">Source: {source}</span>}
      {onRefresh && (
        <button className="inline-flex items-center gap-1 hover:text-fg disabled:opacity-50" onClick={onRefresh} disabled={loading}>
          <IconRefresh className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      )}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 1500);
      }}
      aria-label={`${label}: ${value}`}
    >
      <IconCopy width={14} height={14} />
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}

export function ExtLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1 hover:text-fg ${className}`}>
      {children}
      <IconExternal />
    </a>
  );
}

export function TokenAvatar({ src, symbol, size = 32 }: { src: string | null; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px] font-semibold text-muted"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {symbol.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  return (
    // Images are restricted to DEX Screener CDN hosts in safeImageUrl().
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-panel-2 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function Stat({ label, value, sub, valueClass = "" }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-base font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** One-line general warning that expands to the full text. Shown on every token, not a per-token rating. */
export function RiskDisclaimer() {
  return (
    <details className="group rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-warn [&::-webkit-details-marker]:hidden">
        <IconAlert width={16} height={16} className="shrink-0" />
        <span className="font-medium">High-risk asset: you can lose everything.</span>
        <span className="ml-auto text-xs text-muted group-open:hidden">Why?</span>
        <span className="ml-auto hidden text-xs text-muted group-open:inline">Hide</span>
      </summary>
      <p className="mt-2 text-muted">
        Memecoins are extremely risky. Low liquidity, concentrated ownership and volatile prices can cause substantial or
        total losses. Anyone can create a token with any name or logo, and scams are common. This is a general warning
        shown for every token. Use the Risk checker for signals about a specific token. Nothing on this site is financial
        advice or a recommendation.
      </p>
    </details>
  );
}
