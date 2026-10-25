import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { TokenView } from "./TokenView";

export const metadata: Metadata = { title: "Token details" };

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <TokenView />
    </Suspense>
  );
}
