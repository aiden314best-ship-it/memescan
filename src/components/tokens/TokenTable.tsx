"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFavorites } from "./favorites";
import { IconStar } from "@/components/icons";
import { ExtLink, TokenAvatar } from "@/components/ui";
import type { TokenRow } from "@/lib/dexscreener/normalize";
import type { SortKey, SortState } from "@/lib/filters";
import { changeClass, formatAge, formatCompact, formatCompactUsd, formatPct, formatUsd, NA } from "@/lib/format";
import { useNow } from "@/lib/client/useApi";

export function solscanToken(mint: string) {
  return `https://solscan.io/token/${mint}`;
}

function SortHeader({ label, k, sort, onSort, className = "" }: { label: string; k: SortKey; sort: SortState; onSort: (s: SortState) => void; className?: string }) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2 text-right font-medium ${className}`}>
      <button
        className={`inline-flex items-center gap-1 ${active ? "text-fg" : "hover:text-fg"}`}
        onClick={() => onSort({ key: k, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active && <span aria-hidden>{sort.dir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

function FavButton({ row }: { row: TokenRow }) {
  const { favoriteSet, toggle } = useFavorites();
  const fav = favoriteSet.has(row.mint);
  return (
    <button
      onClick={() => toggle(row)}
      className={fav ? "text-warn" : "text-muted hover:text-fg"}
      aria-label={fav ? `Remove ${row.symbol} from favorites` : `Add ${row.symbol} to favorites`}
      aria-pressed={fav}
    >
      <IconStar filled={fav} width={16} height={16} />
    </button>
  );
}

function Txns({ row }: { row: TokenRow }) {
  const { buys, sells } = row.txns.h24;
  if (buys === null && sells === null) return <>{NA}</>;
  return (
    <span className="tabular">
      <span className="text-up">{formatCompact(buys)}</span>
      <span className="text-muted">/</span>
      <span className="text-down">{formatCompact(sells)}</span>
    </span>
  );
}

function TokenCell({ row, extra }: { row: TokenRow; extra?: ReactNode }) {
  return (
    <Link href={`/token/${row.mint}`} className="flex min-w-0 items-center gap-2.5">
      <TokenAvatar src={row.imageUrl} symbol={row.symbol} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{row.symbol}</span>
          <span className="text-xs text-muted">/{row.quoteSymbol}</span>
        </div>
        <div className="truncate text-xs text-muted" title={row.name}>
          {row.name} · {row.dexId}
          {extra}
        </div>
      </div>
    </Link>
  );
}

export function TokenTable({
  rows,
  sort,
  onSort,
  rowExtra,
}: {
  rows: TokenRow[];
  sort: SortState;
  onSort: (s: SortState) => void;
  rowExtra?: (row: TokenRow) => ReactNode;
}) {
  const now = useNow(30_000);
  return (
    <>
      {/* Desktop/tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="w-8 px-2 py-2" aria-label="Favorite" />
              <th className="px-3 py-2 text-left font-medium">Token</th>
              <SortHeader label="Price" k="price" sort={sort} onSort={onSort} />
              <SortHeader label="1h" k="change1h" sort={sort} onSort={onSort} />
              <SortHeader label="24h" k="change24h" sort={sort} onSort={onSort} />
              <SortHeader label="Volume 24h" k="volume24h" sort={sort} onSort={onSort} />
              <SortHeader label="Liquidity" k="liquidity" sort={sort} onSort={onSort} />
              <SortHeader label="Mkt cap" k="marketCap" sort={sort} onSort={onSort} />
              <SortHeader label="Txns 24h" k="txns24h" sort={sort} onSort={onSort} />
              <SortHeader label="Age" k="age" sort={sort} onSort={onSort} />
              <th className="px-3 py-2 text-right font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.mint} className="border-b border-line/60 hover:bg-panel-2/60">
                <td className="px-2 py-2.5 text-center">
                  <FavButton row={row} />
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <TokenCell row={row} extra={rowExtra?.(row)} />
                </td>
                <td className="tabular px-3 py-2.5 text-right">{formatUsd(row.priceUsd)}</td>
                <td className={`tabular px-3 py-2.5 text-right ${changeClass(row.priceChange.h1)}`}>{formatPct(row.priceChange.h1, 1)}</td>
                <td className={`tabular px-3 py-2.5 text-right ${changeClass(row.priceChange.h24)}`}>{formatPct(row.priceChange.h24, 1)}</td>
                <td className="tabular px-3 py-2.5 text-right">{formatCompactUsd(row.volume.h24)}</td>
                <td className={`tabular px-3 py-2.5 text-right ${row.liquidityUsd !== null && row.liquidityUsd < 10_000 ? "text-warn" : ""}`}>
                  {formatCompactUsd(row.liquidityUsd)}
                </td>
                <td className="tabular px-3 py-2.5 text-right" title={row.marketCap === null && row.fdv !== null ? "FDV (market cap not reported)" : undefined}>
                  {formatCompactUsd(row.marketCap ?? row.fdv)}
                  {row.marketCap === null && row.fdv !== null && <span className="ml-0.5 text-[10px] text-muted">FDV</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Txns row={row} />
                </td>
                <td className="tabular px-3 py-2.5 text-right text-muted">{formatAge(row.pairCreatedAt, now)}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-3 text-xs text-muted">
                    <ExtLink href={row.pairUrl}>DEX</ExtLink>
                    <ExtLink href={solscanToken(row.mint)}>Solscan</ExtLink>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.mint} className="rounded-lg border border-line bg-panel-2/40 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <TokenCell row={row} extra={rowExtra?.(row)} />
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-medium">{formatUsd(row.priceUsd)}</div>
                <div className={`tabular text-xs ${changeClass(row.priceChange.h24)}`}>{formatPct(row.priceChange.h24, 1)} 24h</div>
              </div>
              <FavButton row={row} />
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
              <div>
                <dt className="text-muted">Vol 24h</dt>
                <dd className="tabular">{formatCompactUsd(row.volume.h24)}</dd>
              </div>
              <div>
                <dt className="text-muted">Liq</dt>
                <dd className="tabular">{formatCompactUsd(row.liquidityUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted">MCap</dt>
                <dd className="tabular">{formatCompactUsd(row.marketCap ?? row.fdv)}</dd>
              </div>
              <div>
                <dt className="text-muted">Age</dt>
                <dd className="tabular">{formatAge(row.pairCreatedAt, now)}</dd>
              </div>
            </dl>
            <div className="mt-2 flex gap-4 text-xs text-muted">
              <Txns row={row} />
              <ExtLink href={row.pairUrl}>DEX Screener</ExtLink>
              <ExtLink href={solscanToken(row.mint)}>Solscan</ExtLink>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
