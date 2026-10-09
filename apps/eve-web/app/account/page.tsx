import { EvaluationAccess } from "@/app/evaluation/evaluation";
import { ControlPanel } from "./control-panel";
export default function AccountPage() {
  return (
    <EvaluationAccess>
      <ControlPanel />
    </EvaluationAccess>
  );
}
