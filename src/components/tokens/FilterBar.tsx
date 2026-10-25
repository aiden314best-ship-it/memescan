"use client";
import { useState } from "react";
import { DEFAULT_FILTERS, parseFilterNumber, type SortKey, type SortState, type TokenFilters } from "@/lib/filters";

type NumericKey = Exclude<keyof TokenFilters, "query" | "favoritesOnly">;

const NUMERIC_FIELDS: { key: NumericKey; label: string; placeholder: string }[] = [
  { key: "minLiquidity", label: "Min liquidity ($)", placeholder: "e.g. 50k" },
  { key: "minMarketCap", label: "Min market cap ($)", placeholder: "e.g. 100k" },
  { key: "maxMarketCap", label: "Max market cap ($)", placeholder: "e.g. 10m" },
  { key: "minVolume24h", label: "Min 24h volume ($)", placeholder: "e.g. 25k" },
  { key: "maxAgeHours", label: "Max pair age (hours)", placeholder: "e.g. 24" },
  { key: "minChange24h", label: "Min 24h change (%)", placeholder: "e.g. -50" },
  { key: "maxChange24h", label: "Max 24h change (%)", placeholder: "e.g. 500" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "volume24h", label: "24h volume" },
  { key: "liquidity", label: "Liquidity" },
  { key: "marketCap", label: "Market cap" },
  { key: "change24h", label: "24h change" },
  { key: "change1h", label: "1h change" },
  { key: "txns24h", label: "24h transactions" },
  { key: "age", label: "Pair age (newest)" },
];

export function FilterBar({
  filters,
  onChange,
  sort,
  onSort,
  searchPlaceholder = "Filter by name, symbol or mint",
  showAdvancedByDefault = false,
  extraSorts = [],
}: {
  filters: TokenFilters;
  onChange: (f: TokenFilters) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  searchPlaceholder?: string;
  showAdvancedByDefault?: boolean;
  extraSorts?: { key: SortKey; label: string }[];
}) {
  const [open, setOpen] = useState(showAdvancedByDefault);
  // Raw text per field so users can type "50k" without the input fighting them.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const active = NUMERIC_FIELDS.filter((f) => filters[f.key] !== null).length + (filters.favoritesOnly ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-sm"
          placeholder={searchPlaceholder}
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          aria-label="Filter tokens"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select
              className="input w-auto py-1.5"
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
                onSort({ key, dir });
              }}
            >
              {[...extraSorts, ...SORTS].map((s) => (
                <optgroup key={s.key} label={s.label}>
                  <option value={`${s.key}:desc`}>{s.label} ↓</option>
                  {s.key !== "source" && <option value={`${s.key}:asc`}>{s.label} ↑</option>}
                </optgroup>
              ))}
            </select>
          </label>
          <button className="btn-ghost py-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Filters{active ? ` (${active})` : ""}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={filters.favoritesOnly} onChange={(e) => onChange({ ...filters, favoritesOnly: e.target.checked })} />
            Favorites only
          </label>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-panel-2/50 p-3 sm:grid-cols-4 lg:grid-cols-7">
          {NUMERIC_FIELDS.map((f) => {
            const text = raw[f.key] ?? (filters[f.key] === null ? "" : String(filters[f.key]));
            const invalid = text.trim() !== "" && parseFilterNumber(text) === null;
            return (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                <input
                  className={`input py-1.5 ${invalid ? "border-down" : ""}`}
                  inputMode="decimal"
                  placeholder={f.placeholder}
                  value={text}
                  aria-invalid={invalid}
                  onChange={(e) => {
                    setRaw((r) => ({ ...r, [f.key]: e.target.value }));
                    onChange({ ...filters, [f.key]: parseFilterNumber(e.target.value) });
                  }}
                />
              </label>
            );
          })}
          <div className="col-span-2 flex items-end sm:col-span-4 lg:col-span-7">
            <button
              className="text-xs text-muted hover:text-fg"
              onClick={() => {
                setRaw({});
                onChange({ ...DEFAULT_FILTERS, query: filters.query });
              }}
            >
              Clear filters
            </button>
            <span className="ml-auto text-xs text-muted">Tokens with missing data are excluded when a filter needs that value.</span>
          </div>
        </div>
      )}
    </div>
  );
}
