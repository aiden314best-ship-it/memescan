"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, ErrorBanner, Notice, PageHeader } from "@/components/ui";
import type { StatusResponse } from "@/lib/api-types";
import { SLIPPAGE_MAX_BPS, SLIPPAGE_MIN_BPS, validateSlippageInput } from "@/lib/jupiter";
import { formatTime } from "@/lib/format";
import { alertsStore, favoritesStore, liquidityObsStore, prefsStore, swapHistoryStore, type Prefs } from "@/lib/client/stores";
import { useApi } from "@/lib/client/useApi";

const PRESETS = [50, 100, 300, 500];
const REFRESH: { ms: Prefs["refreshMs"]; label: string }[] = [
  { ms: 15_000, label: "15 seconds" },
  { ms: 30_000, label: "30 seconds" },
  { ms: 60_000, label: "1 minute" },
  { ms: 120_000, label: "2 minutes" },
  { ms: 0, label: "Manual only" },
];

export function SettingsView() {
  const [prefs, setPrefs] = prefsStore.useStore();
  const [custom, setCustom] = useState(prefs.slippageBps && !PRESETS.includes(prefs.slippageBps) ? String(prefs.slippageBps / 100) : "");
  const status = useApi<StatusResponse>("/api/status");
  const customCheck = custom ? validateSlippageInput(custom) : null;
  const currentWarning = prefs.slippageBps ? validateSlippageInput(String(prefs.slippageBps / 100)).warning : null;
  const [cleared, setCleared] = useState(false);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Appearance">
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button key={t} className={prefs.theme === t ? "btn-primary" : "btn-ghost"} onClick={() => setPrefs((p) => ({ ...p, theme: t }))}>
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Data refresh">
          <label className="block">
            <span className="label">Auto-refresh market data every</span>
            <select className="input" value={prefs.refreshMs} onChange={(e) => setPrefs((p) => ({ ...p, refreshMs: Number(e.target.value) as Prefs["refreshMs"] }))}>
              {REFRESH.map((r) => (
                <option key={r.ms} value={r.ms}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-muted">
            The server caches DEX Screener responses for 30–60 seconds and throttles requests to stay within the published limits (60/min for
            profile and boost lists, 300/min for pair data), so refreshing faster than the cache does not get newer data. Polling pauses while the
            tab is hidden.
          </p>
        </Card>

        <Card title="Swap slippage" className="lg:col-span-2">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button className={prefs.slippageBps === null ? "btn-primary" : "btn-ghost"} onClick={() => setPrefs((p) => ({ ...p, slippageBps: null }))}>
                Auto (recommended)
              </button>
              {PRESETS.map((bps) => (
                <button key={bps} className={prefs.slippageBps === bps ? "btn-primary" : "btn-ghost"} onClick={() => setPrefs((p) => ({ ...p, slippageBps: bps }))}>
                  {bps / 100}%
                </button>
              ))}
              <div className="flex items-center gap-2">
                <input className="input w-24" inputMode="decimal" placeholder="Custom %" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom slippage percent" />
                <button className="btn-ghost" disabled={!customCheck?.bps} onClick={() => customCheck?.bps && setPrefs((p) => ({ ...p, slippageBps: customCheck.bps }))}>
                  Set
                </button>
              </div>
            </div>
            {customCheck?.error && <p className="text-sm text-down">{customCheck.error}</p>}
            {customCheck?.warning && <p className="text-sm text-warn">{customCheck.warning}</p>}
            {currentWarning && <Notice tone="warn">{currentWarning}</Notice>}
            <p className="text-xs text-muted">
              Current: {prefs.slippageBps ? `${prefs.slippageBps / 100}%` : "Auto"}. Auto lets Jupiter&apos;s real-time slippage estimator choose per trade. Setting
              a custom value switches Jupiter to &quot;manual&quot; mode. Allowed range: {SLIPPAGE_MIN_BPS / 100}%–{SLIPPAGE_MAX_BPS / 100}%.
            </p>
          </div>
        </Card>

        <Card
          title="Network status"
          className="lg:col-span-2"
          actions={
            <button className="text-xs text-muted hover:text-fg" onClick={status.refresh} disabled={status.loading}>
              {status.loading ? "Checking…" : "Re-check"}
            </button>
          }
        >
          {status.error && <ErrorBanner message={status.error} onRetry={status.refresh} />}
          {status.data && (
            <div className="space-y-3">
              <ul className="divide-y divide-line/60 text-sm">
                {status.data.services.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center gap-3 py-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.ok ? "bg-up" : "bg-down"}`} aria-hidden />
                    <span className="font-medium">{s.name}</span>
                    <span className="flex-1 text-muted">{s.detail}</span>
                    <span className="tabular text-xs text-muted">{s.latencyMs !== null ? `${s.latencyMs} ms` : "—"}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Checked from this app&apos;s server at {formatTime(status.data.checkedAt)} · RPC host: {status.data.config.rpcHost} · Jupiter API key:{" "}
                {status.data.config.jupiterKeyConfigured ? "configured" : "not configured (keyless tier)"} · Swap execution:{" "}
                {status.data.config.swapExecutionEnabled ? "enabled" : "disabled (quote-only)"}
              </p>
            </div>
          )}
        </Card>

        <Card title="Local data">
          <p className="text-sm text-muted">
            Preferences, favorites, alert rules, liquidity observations and your confirmed-swap log are stored only in this browser&apos;s local storage.
            No private keys or seed phrases are ever stored.
          </p>
          <button
            className="btn-ghost mt-3"
            onClick={() => {
              if (!confirm("Delete all MemeScan data stored in this browser?")) return;
              favoritesStore.set([]);
              alertsStore.set([]);
              swapHistoryStore.set([]);
              liquidityObsStore.set({});
              setCleared(true);
            }}
          >
            Clear favorites, alerts &amp; history
          </button>
          {cleared && <p className="mt-2 text-sm text-up">Local data cleared.</p>}
        </Card>

        <Card title="About & policies">
          <ul className="space-y-2 text-sm">
            <li>
              <Link className="underline" href="/legal#risk">
                Risk disclosure
              </Link>
            </li>
            <li>
              <Link className="underline" href="/legal#privacy">
                Privacy
              </Link>
            </li>
            <li>
              <Link className="underline" href="/legal#docs">
                How this app works (documentation)
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
