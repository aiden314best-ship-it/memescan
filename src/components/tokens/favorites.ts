"use client";
import { useMemo } from "react";
import { favoritesStore } from "@/lib/client/stores";

export function useFavorites() {
  const [favorites, setFavorites] = favoritesStore.useStore();
  const set = useMemo(() => new Set(favorites.map((f) => f.mint)), [favorites]);
  const toggle = (token: { mint: string; symbol: string; name: string }) =>
    setFavorites((list) =>
      list.some((f) => f.mint === token.mint)
        ? list.filter((f) => f.mint !== token.mint)
        : [...list, { mint: token.mint, symbol: token.symbol.slice(0, 16), name: token.name.slice(0, 64), addedAt: Date.now() }].slice(-200),
    );
  return { favorites, favoriteSet: set, toggle };
}
