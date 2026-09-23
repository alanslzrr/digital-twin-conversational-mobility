import { AgentChat } from "@/app/_components/agent-chat";
import { EvaluationAccess } from "./evaluation";

export default function EvaluationPage() {
  return (
    <EvaluationAccess>
      <AgentChat />
    </EvaluationAccess>
  );
}
