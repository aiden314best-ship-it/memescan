"use client";
import { useMemo, useState, type ReactNode } from "react";
import { FilterBar } from "./FilterBar";
import { useFavorites } from "./favorites";
import { TokenTable } from "./TokenTable";
import { EmptyState, ErrorBanner, Freshness, SkeletonRows } from "@/components/ui";
import type { DataMeta } from "@/lib/api-types";
import type { TokenRow } from "@/lib/dexscreener/normalize";
import { applyFilters, DEFAULT_FILTERS, sortRows, type SortKey, type SortState, type TokenFilters } from "@/lib/filters";
import { useNow } from "@/lib/client/useApi";

/** Filterable, sortable token list with loading, error, stale and empty states. */
export function TokenListView({
  data,
  rows,
  loading,
  error,
  refresh,
  initialSort = { key: "volume24h", dir: "desc" },
  initialFilters = DEFAULT_FILTERS,
  emptyText,
  rowExtra,
  extraSorts,
  footnote,
  staleAfterMs,
}: {
  data: DataMeta | null;
  rows: TokenRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  initialSort?: SortState;
  initialFilters?: TokenFilters;
  emptyText?: ReactNode;
  rowExtra?: (row: TokenRow) => ReactNode;
  extraSorts?: { key: SortKey; label: string }[];
  footnote?: ReactNode;
  staleAfterMs?: number;
}) {
  const [filters, setFilters] = useState<TokenFilters>(initialFilters);
  const [sort, setSort] = useState<SortState>(initialSort);
  const { favoriteSet } = useFavorites();
  const now = useNow(30_000);

  const visible = useMemo(
    () => sortRows(applyFilters(rows, filters, favoriteSet, now), sort),
    [rows, filters, favoriteSet, now, sort],
  );

  return (
    <div className="card">
      <div className="space-y-3 border-b border-line p-4">
        <FilterBar filters={filters} onChange={setFilters} sort={sort} onSort={setSort} extraSorts={extraSorts} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Freshness
            fetchedAt={data?.fetchedAt}
            stale={data?.stale}
            staleReason={data?.staleReason}
            source={data?.source}
            onRefresh={refresh}
            loading={loading}
            staleAfterMs={staleAfterMs}
          />
          {data && (
            <span className="text-xs text-muted">
              Showing {visible.length} of {rows.length}
              {data.dropped > 0 && ` · ${data.dropped} malformed upstream item(s) ignored`}
            </span>
          )}
        </div>
      </div>
      <div className="p-2 sm:p-4">
        {error && (
          <div className="mb-3">
            <ErrorBanner
              message={data ? `${error} Showing the last data that loaded successfully.` : error}
              onRetry={refresh}
            />
          </div>
        )}
        {!data && loading && <SkeletonRows />}
        {data && visible.length === 0 && (
          <EmptyState title={rows.length === 0 ? "No tokens returned" : "No tokens match these filters"}>
            {rows.length === 0 ? emptyText : "Loosen or clear the filters to see more results."}
          </EmptyState>
        )}
        {visible.length > 0 && <TokenTable rows={visible} sort={sort} onSort={setSort} rowExtra={rowExtra} />}
        {footnote && <div className="mt-3 text-xs text-muted">{footnote}</div>}
      </div>
    </div>
  );
}
