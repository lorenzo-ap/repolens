import Link from "next/link";
import { TopBar } from "@/components/layout/header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main id="main" className="mx-auto flex max-w-md flex-col items-start px-6 py-24">
        <p className="font-mono text-xs text-fg-tertiary">404</p>
        <h1 className="mt-2 text-xl">Page not found</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          The page does not exist, or you do not have access to this repository. Private
          repositories are only visible to the account that added them.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild variant="primary">
            <Link href="/demo">Open the demo</Link>
          </Button>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
