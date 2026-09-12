import { Suspense } from "react";
import { ArchitectureView } from "@/components/architecture/graph-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Architecture" };

export default function ArchitecturePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[560px]" />}>
      <ArchitectureView />
    </Suspense>
  );
}
