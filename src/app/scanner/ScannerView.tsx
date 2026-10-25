"use client";
import { useMemo, useState } from "react";
import { TokenListView } from "@/components/tokens/TokenListView";
import { Notice, PageHeader } from "@/components/ui";
import type { DataMeta, ListingsResponse } from "@/lib/api-types";
import type { TokenRow } from "@/lib/dexscreener/normalize";
import { DEFAULT_FILTERS } from "@/lib/filters";
import { prefsStore } from "@/lib/client/stores";
import { useApi } from "@/lib/client/useApi";

const SOURCES = [
  { id: "profiles-latest", label: "New token profiles", short: "Profile" },
  { id: "boosts-latest", label: "New boosts", short: "Boost" },
  { id: "community-takeovers", label: "Community takeovers", short: "CTO" },
] as const;
type SourceId = (typeof SOURCES)[number]["id"];

export function ScannerView() {
  const [prefs] = prefsStore.useStore();
  const [enabled, setEnabled] = useState<Record<SourceId, boolean>>({
    "profiles-latest": true,
    "boosts-latest": true,
    "community-takeovers": true,
  });
  const profiles = useApi<ListingsResponse>(enabled["profiles-latest"] ? "/api/dex/listings?source=profiles-latest" : null, prefs.refreshMs);
  const boosts = useApi<ListingsResponse>(enabled["boosts-latest"] ? "/api/dex/listings?source=boosts-latest" : null, prefs.refreshMs);
  const ctos = useApi<ListingsResponse>(enabled["community-takeovers"] ? "/api/dex/listings?source=community-takeovers" : null, prefs.refreshMs);
  const states: Record<SourceId, typeof profiles> = { "profiles-latest": profiles, "boosts-latest": boosts, "community-takeovers": ctos };

  const merged = useMemo(() => {
    const rows = new Map<string, TokenRow>();
    const sourcesByMint = new Map<string, Set<string>>();
    const metas: DataMeta[] = [];
    for (const s of SOURCES) {
      const data = states[s.id].data;
      if (!enabled[s.id] || !data) continue;
      metas.push(data);
      for (const row of data.rows) {
        rows.set(row.mint, row);
        const set = sourcesByMint.get(row.mint) ?? new Set();
        set.add(s.short);
        sourcesByMint.set(row.mint, set);
      }
    }
    const meta: DataMeta | null = metas.length
      ? {
          fetchedAt: Math.min(...metas.map((m) => m.fetchedAt)),
          stale: metas.some((m) => m.stale),
          staleReason: metas.find((m) => m.stale)?.staleReason,
          dropped: metas.reduce((n, m) => n + m.dropped, 0),
          source: "DEX Screener latest profiles, boosts and community takeovers",
        }
      : null;
    return { rows: [...rows.values()], sourcesByMint, meta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.data, boosts.data, ctos.data, enabled]);

  const errors = SOURCES.filter((s) => enabled[s.id] && states[s.id].error).map((s) => `${s.label}: ${states[s.id].error}`);
  const loading = SOURCES.some((s) => enabled[s.id] && states[s.id].loading);

  return (
    <>
      <PageHeader
        title="Memecoin scanner"
        subtitle="Recently listed or recently active Solana tokens, discovered through DEX Screener's public 'latest' endpoints and enriched with live pair data. Newest pairs first. This is discovery, not a recommendation: most new tokens lose most of their value."
      />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Sources:</span>
        {SOURCES.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5">
            <input type="checkbox" checked={enabled[s.id]} onChange={(e) => setEnabled((x) => ({ ...x, [s.id]: e.target.checked }))} />
            {s.label}
          </label>
        ))}
      </div>
      <div className="mb-3">
        <Notice>
          DEX Screener&apos;s public API does not offer a full feed of every new pair. These lists only include tokens whose teams
          created a DEX Screener profile, bought a boost, or claimed a community takeover, so they are a sample, not complete coverage.
        </Notice>
      </div>
      <TokenListView
        data={merged.meta}
        rows={merged.rows}
        loading={loading}
        error={errors.length ? errors.join(" · ") : null}
        refresh={() => SOURCES.forEach((s) => enabled[s.id] && states[s.id].refresh())}
        initialSort={{ key: "age", dir: "desc" }}
        initialFilters={DEFAULT_FILTERS}
        emptyText={SOURCES.some((s) => enabled[s.id]) ? "No Solana tokens in the selected sources right now." : "Select at least one source."}
        rowExtra={(row) => (
          <>
            {[...(merged.sourcesByMint.get(row.mint) ?? [])].map((s) => (
              <span key={s} className="ml-1 rounded bg-panel px-1 text-[10px] text-muted ring-1 ring-line">
                {s}
              </span>
            ))}
          </>
        )}
      />
    </>
  );
}
