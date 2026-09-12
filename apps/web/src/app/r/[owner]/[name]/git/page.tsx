import { Suspense } from "react";
import { GitView } from "@/components/categories/git-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata = { title: "Git history" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <GitView />
    </Suspense>
  );
}
