import { AgentChat } from "@/app/_components/agent-chat";
import { EvaluationAccess } from "@/app/evaluation/evaluation";

export default function NewSessionPage() {
  return (
    <EvaluationAccess>
      <AgentChat sessionless />
    </EvaluationAccess>
  );
}
