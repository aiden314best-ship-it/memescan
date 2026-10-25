import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonRows } from "@/components/ui";
import { RiskView } from "./RiskView";

export const metadata: Metadata = { title: "Risk checker" };

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <RiskView />
    </Suspense>
  );
}
