import { ControlPanel } from "@/app/account/control-panel";
import { EvaluationAccess } from "@/app/evaluation/evaluation";
export default function AdminPage() {
  return (
    <EvaluationAccess>
      <ControlPanel admin />
    </EvaluationAccess>
  );
}
