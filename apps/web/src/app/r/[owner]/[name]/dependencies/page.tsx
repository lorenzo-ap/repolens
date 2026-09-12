import { Suspense } from "react";
import { DependenciesView } from "@/components/categories/dependencies-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Dependencies" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <DependenciesView />
    </Suspense>
  );
}
