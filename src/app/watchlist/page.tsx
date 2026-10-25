import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { WatchlistView } from "./WatchlistView";

export const metadata: Metadata = { title: "Watchlist & alerts" };

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <WatchlistView />
    </Suspense>
  );
}
