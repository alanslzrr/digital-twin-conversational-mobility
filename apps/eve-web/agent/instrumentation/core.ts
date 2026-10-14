import { traceEnrichmentEnabled } from "@mobility/contracts";
import { otelIntegration } from "eve/instrumentation/otel";
import { currentBudgetContext } from "../../src/budget-context";
import {
  createTraceEnrichmentProcessor,
  traceExportPolicy,
} from "../../src/otel-enrichment";

export default otelIntegration({
  exportPolicy: traceExportPolicy,
  spanProcessors: [createTraceEnrichmentProcessor()],
  runtimeContext: ({ session, turn, step }) => {
    if (!traceEnrichmentEnabled(process.env)) return;
    try {
      const scope = currentBudgetContext();
      const auth = session.auth.current;
      if (
        auth?.issuer !== "mobility-evaluation" ||
        auth.authenticator !== "evaluator-password" ||
        auth.principalType !== "user" ||
        scope.principalId !== auth.principalId ||
        scope.sessionId !== session.id ||
        (scope.purpose === "step" &&
          (scope.turnId !== turn.id || scope.stepIndex !== step.index))
      )
        return;
      // Coordinates only. Model content and principal IDs are not span attributes.
      return {
        "mobai.turn_id": scope.turnId,
        "mobai.step_index": scope.stepIndex,
        "mobai.purpose": scope.purpose,
      };
    } catch {
      return;
    }
  },
});
