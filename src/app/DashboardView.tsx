"use client";
import { useState } from "react";
import { TokenListView } from "@/components/tokens/TokenListView";
import { PageHeader, RiskDisclaimer } from "@/components/ui";
import type { ListingsResponse, RowsResponse } from "@/lib/api-types";
import { prefsStore } from "@/lib/client/stores";
import { useApi } from "@/lib/client/useApi";

const TABS = [
  { id: "boosts-top", label: "Most boosted" },
  { id: "boosts-latest", label: "Recently boosted" },
] as const;

export function DashboardView() {
  const [prefs] = prefsStore.useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("boosts-top");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  const listings = useApi<ListingsResponse>(query ? null : `/api/dex/listings?source=${tab}`, prefs.refreshMs);
  const search = useApi<RowsResponse>(query ? `/api/dex/search?q=${encodeURIComponent(query)}` : null, prefs.refreshMs);
  const active = query ? search : listings;
  const boostByMint = new Map(listings.data?.listings.map((l) => [l.mint, l.totalBoostAmount ?? l.boostAmount]) ?? []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            Solana tokens currently promoted on DEX Screener, with live market data for each token&apos;s most liquid pool.
            DEX Screener&apos;s public API has no &quot;trending&quot; endpoint. <strong>Boosts are paid promotions</strong>, not
            a sign of quality or safety.
          </>
        }
      />

      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const q = searchInput.trim();
          setQuery(q.length >= 2 ? q : null);
        }}
      >
        <input
          className="input sm:max-w-md"
          placeholder="Search all Solana pairs by name, symbol or mint address"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={64}
          aria-label="Search DEX Screener"
        />
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">
            Search
          </button>
          {query && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setQuery(null);
                setSearchInput("");
              }}
            >
              Clear search
            </button>
          )}
        </div>
      </form>

      {!query && (
        <div className="mb-3 flex gap-1 rounded-lg border border-line bg-panel p-1 text-sm sm:inline-flex" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md px-3 py-1.5 sm:flex-none ${tab === t.id ? "bg-panel-2 font-medium" : "text-muted hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {query && <p className="mb-3 text-sm text-muted">Search results for &quot;{query}&quot; (Solana pairs only)</p>}

      <TokenListView
        key={query ?? tab}
        data={active.data}
        rows={active.data?.rows ?? []}
        loading={active.loading}
        error={active.error}
        refresh={active.refresh}
        emptyText={query ? "DEX Screener returned no Solana pairs for this search." : "DEX Screener returned no Solana tokens for this list right now."}
        rowExtra={(row) => {
          const boost = boostByMint.get(row.mint);
          return !query && boost ? <span className="ml-1 rounded bg-accent/15 px-1 text-[10px] text-accent" title={`${boost} active boosts (paid promotion)`}>⚡{boost}</span> : null;
        }}
        footnote={
          !query && listings.data && listings.data.missingPairs > 0
            ? `${listings.data.missingPairs} listed token(s) had no Solana pair data on DEX Screener and are not shown.`
            : undefined
        }
      />
      <div className="mt-4">
        <RiskDisclaimer compact />
      </div>
    </>
  );
}
