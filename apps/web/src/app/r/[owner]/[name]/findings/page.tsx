import { Suspense } from "react";
import { FindingsView } from "@/components/findings/findings-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Findings" };

export default function FindingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <FindingsView />
    </Suspense>
  );
}
