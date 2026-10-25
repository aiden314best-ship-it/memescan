import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { TradeView } from "./TradeView";

export const metadata: Metadata = { title: "Trade" };

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <TradeView />
    </Suspense>
  );
}
