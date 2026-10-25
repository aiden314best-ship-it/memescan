"use client";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ALERT_CHECK_INTERVAL_MS, lastAlertCheck } from "@/components/AlertEngine";
import { useFavorites } from "@/components/tokens/favorites";
import { TokenListView } from "@/components/tokens/TokenListView";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import type { RowsResponse } from "@/lib/api-types";
import { metricValue } from "@/lib/alerts";
import { formatAge, formatCompactUsd, formatTime, formatUsd } from "@/lib/format";
import { parseFilterNumber } from "@/lib/filters";
import { alertsStore, prefsStore, type AlertRule } from "@/lib/client/stores";
import { useApi, useNow } from "@/lib/client/useApi";
import { isSolanaAddress, shortAddress } from "@/lib/solana/address";

const permListeners = new Set<() => void>();
const subscribePerm = (l: () => void) => {
  permListeners.add(l);
  return () => permListeners.delete(l);
};
const readPerm = (): NotificationPermission | "unsupported" => ("Notification" in window ? Notification.permission : "unsupported");

function NotificationPermission() {
  const perm = useSyncExternalStore(subscribePerm, readPerm, () => null);
  if (perm === null) return null;
  if (perm === "unsupported") return <p className="text-xs text-muted">This browser does not support desktop notifications; alerts appear as in-page messages.</p>;
  if (perm === "granted") return <p className="text-xs text-up">Browser notifications are enabled.</p>;
  if (perm === "denied") return <p className="text-xs text-warn">Notifications are blocked for this site in your browser settings; alerts will appear in-page only.</p>;
  return (
    <button className="btn-ghost py-1 text-xs" onClick={async () => {
        await Notification.requestPermission();
        permListeners.forEach((l) => l());
      }}>
      Enable browser notifications
    </button>
  );
}

function AlertForm({ defaultMint, rows }: { defaultMint: string; rows: RowsResponse["rows"] }) {
  const { favorites } = useFavorites();
  const [mint, setMint] = useState(defaultMint);
  const [metric, setMetric] = useState<AlertRule["metric"]>("price");
  const [op, setOp] = useState<AlertRule["op"]>("above");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const row = rows.find((r) => r.mint === mint);
  const current = row ? metricValue(row, metric) : null;

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        const m = mint.trim();
        const v = metric === "price" ? Number(value) : parseFilterNumber(value);
        if (!isSolanaAddress(m)) return setError("Enter a valid token mint address.");
        if (v === null || !Number.isFinite(v) || v <= 0) return setError("Enter a positive threshold.");
        const symbol = row?.symbol ?? favorites.find((f) => f.mint === m)?.symbol ?? shortAddress(m);
        alertsStore.set((list) =>
          [
            ...list,
            { id: crypto.randomUUID(), mint: m, symbol, metric, op, value: v, enabled: true, createdAt: Date.now(), lastTriggeredAt: null, lastTriggeredValue: null },
          ].slice(-100),
        );
        setError(null);
        setValue("");
      }}
    >
      <label className="block sm:col-span-2">
        <span className="label">Token</span>
        <input className="input font-mono text-xs" list="fav-mints" placeholder="Mint address" value={mint} onChange={(e) => setMint(e.target.value)} spellCheck={false} />
        <datalist id="fav-mints">
          {favorites.map((f) => (
            <option key={f.mint} value={f.mint}>
              {f.symbol}
            </option>
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="label">Metric</span>
        <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as AlertRule["metric"])}>
          <option value="price">Price (USD)</option>
          <option value="marketCap">Market cap (USD)</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Condition</span>
        <select className="input" value={op} onChange={(e) => setOp(e.target.value as AlertRule["op"])}>
          <option value="above">Rises to or above</option>
          <option value="below">Falls to or below</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Threshold {current !== null && <span className="text-muted">(now {metric === "price" ? formatUsd(current) : formatCompactUsd(current)})</span>}</span>
        <input className="input" inputMode="decimal" placeholder={metric === "price" ? "0.0012" : "1.5m"} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
        <button className="btn-primary" type="submit">
          Add alert
        </button>
        {error && <span className="text-sm text-down">{error}</span>}
      </div>
    </form>
  );
}

export function WatchlistView() {
  const params = useSearchParams();
  const { favorites } = useFavorites();
  const [alerts, setAlerts] = alertsStore.useStore();
  const [prefs] = prefsStore.useStore();
  const now = useNow(5000);

  const watchMints = [...new Set([...favorites.map((f) => f.mint), ...alerts.map((a) => a.mint)])].slice(0, 90);
  const { data, error, loading, refresh } = useApi<RowsResponse>(watchMints.length ? `/api/dex/tokens?mints=${watchMints.join(",")}` : null, prefs.refreshMs);
  const favRows = (data?.rows ?? []).filter((r) => favorites.some((f) => f.mint === r.mint));
  const missing = favorites.filter((f) => data && !data.rows.some((r) => r.mint === f.mint));
  const check = lastAlertCheck();
  const paramMint = params.get("mint");

  return (
    <>
      <PageHeader title="Watchlist & alerts" subtitle="Your favorite tokens with live data, plus price and market-cap alerts." />
      <div className="space-y-5">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Favorites ({favorites.length})</h2>
          {favorites.length === 0 ? (
            <EmptyState title="No favorites yet">Tap the star next to any token on the dashboard, scanner or token page.</EmptyState>
          ) : (
            <>
              <TokenListView data={data} rows={favRows} loading={loading} error={error} refresh={refresh} emptyText="No market data for your favorites." />
              {missing.length > 0 && (
                <p className="mt-2 text-xs text-muted">No DEX Screener pair data for: {missing.map((m) => m.symbol).join(", ")}.</p>
              )}
            </>
          )}
        </section>

        <Card title="Alerts" actions={<NotificationPermission />}>
          <div className="space-y-4">
            <Notice tone="warn" title="Alerts only work while this site is open">
              Alerts are checked in your browser every {ALERT_CHECK_INTERVAL_MS / 1000} seconds while at least one MemeScan tab is open.
              There is no server or push service, so <strong>you will not be alerted when the site is closed</strong>, when your device sleeps,
              or when the browser suspends background tabs. Do not rely on these alerts to manage risk.
            </Notice>
            <AlertForm key={paramMint ?? ""} defaultMint={paramMint ?? ""} rows={data?.rows ?? []} />
            <p className="text-xs text-muted">
              Last check: {check ? `${formatAge(check.at, now)} ago${check.error ? ` (failed: ${check.error})` : ""}` : "not yet run in this tab"}. Each alert
              fires once and then switches itself off. Data source: DEX Screener (main pool).
            </p>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted">No alerts configured.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {alerts.map((a) => {
                  const row = data?.rows.find((r) => r.mint === a.mint);
                  const current = row ? metricValue(row, a.metric) : null;
                  const fmt = a.metric === "price" ? formatUsd : formatCompactUsd;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className={`h-2 w-2 rounded-full ${a.enabled ? "bg-up" : "bg-muted"}`} aria-hidden />
                      <span className="flex-1">
                        <strong>{a.symbol}</strong> {a.metric === "price" ? "price" : "market cap"} {a.op === "above" ? "≥" : "≤"} {fmt(a.value)}
                        <span className="block text-xs text-muted">
                          Now: {current !== null ? fmt(current) : "unknown"}
                          {a.lastTriggeredAt && ` · Triggered ${formatTime(a.lastTriggeredAt)} at ${fmt(a.lastTriggeredValue)}`}
                        </span>
                      </span>
                      <button className="btn-ghost py-1 text-xs" onClick={() => setAlerts((l) => l.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)))}>
                        {a.enabled ? "Pause" : a.lastTriggeredAt ? "Re-arm" : "Resume"}
                      </button>
                      <button className="btn-ghost py-1 text-xs" onClick={() => setAlerts((l) => l.filter((x) => x.id !== a.id))}>
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
