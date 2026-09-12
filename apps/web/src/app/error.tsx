"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/feedback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16">
      <ErrorState error={error} onRetry={reset} />
    </div>
  );
}
