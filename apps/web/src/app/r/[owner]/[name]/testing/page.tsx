import { Suspense } from "react";
import { TestingView } from "@/components/categories/testing-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Testing" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TestingView />
    </Suspense>
  );
}
