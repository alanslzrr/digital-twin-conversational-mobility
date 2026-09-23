import { AgentChat } from "@/app/_components/agent-chat";
import { EvaluationAccess } from "@/app/evaluation/evaluation";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <EvaluationAccess>
      <AgentChat sessionId={sessionId} />
    </EvaluationAccess>
  );
}
