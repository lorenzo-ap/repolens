import { Suspense } from "react";
import { RepoShell } from "@/components/repo/shell";
import { Skeleton } from "@/components/ui/feedback";

export default async function RepoLayout({
  params,
  children,
}: {
  params: Promise<{ owner: string; name: string }>;
  children: React.ReactNode;
}) {
  const { owner, name } = await params;
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-40" />}>
      <RepoShell owner={decodeURIComponent(owner)} name={decodeURIComponent(name)}>
        {children}
      </RepoShell>
    </Suspense>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(name)}` };
}
