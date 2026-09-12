import { Suspense } from "react";
import { HistoryView } from "@/components/history/history-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <HistoryView />
    </Suspense>
  );
}
