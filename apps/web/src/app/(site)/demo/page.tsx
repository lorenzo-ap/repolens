import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  let target: string | null = null;
  try {
    const demo = await api.demo();
    target = `/r/${demo.repository.owner}/${demo.repository.name}`;
  } catch {
    target = null;
  }
  if (target) redirect(target);
  return (
    <div className="py-16">
      <EmptyState
        title="The demo has not been seeded"
        description={
          <>
            Run <code className="font-mono">pnpm seed:demo</code> with the API database configured.
            It clones a public repository and analyzes it at several commits with the real pipeline.
          </>
        }
        action={
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    </div>
  );
}
