import { Suspense } from "react";
import { AnalysesView } from "@/components/analyses/analyses-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Analyses" };

export default function AnalysesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AnalysesView />
    </Suspense>
  );
}
