import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <p className="font-mono text-xs text-fg-subtle">404</p>
      <h1 className="mt-2 text-xl">Page not found</h1>
      <p className="mt-2 text-sm text-fg-muted">
        The page does not exist, or you do not have access to this repository. Private repositories
        are only visible to the account that added them.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="primary">
          <Link href="/">Home</Link>
        </Button>
        <Button asChild>
          <Link href="/demo">Explore the demo</Link>
        </Button>
      </div>
    </div>
  );
}
