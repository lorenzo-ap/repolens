import { Suspense } from "react";
import { ComplexityView } from "@/components/categories/complexity-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Complexity" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ComplexityView />
    </Suspense>
  );
}
