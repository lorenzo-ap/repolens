import { AnalysisProgress } from "@/components/repo/progress";

export const metadata = { title: "Analysis progress" };

export default async function AnalysisProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnalysisProgress analysisId={id} />;
}
