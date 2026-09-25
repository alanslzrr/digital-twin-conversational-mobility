import { defineState } from "eve/context";
import { defineMemory, defineMemoryProvider } from "eve/memory";
import {
  type Evidence,
  evidenceRecall,
  preserveEvidence,
} from "../../src/compaction-evidence";

const capturedOperations = defineState<string[]>(
  "mobility.compaction-evidence.operation.v1",
  () => [],
);
const evidence = defineState<Evidence>(
  "mobility.compaction-evidence.v1",
  () => ({ entries: [] }),
);
export default defineMemory({
  description:
    "Lossless bounded original conversation evidence, scoped to this authenticated session.",
  visibility: "session",
  scope: (ctx) => {
    const principal = ctx.session.auth.current?.principalId;
    if (!principal) throw new Error("Authenticated evidence scope required");
    return [principal, ctx.session.id];
  },
  provider: defineMemoryProvider({
    recall: {
      "turn.started": () => evidenceRecall(evidence.get()),
      "compaction.completed": () => evidenceRecall(evidence.get()),
    },
    capture: {
      "compaction.requested": (ctx) => {
        if (capturedOperations.get().includes(ctx.operationId)) return;
        if (capturedOperations.get().length >= 30)
          throw new Error("Compaction operation limit reached");
        // Throws before EVE mutates the checkpoint if lossless retention cannot fit.
        const retained = preserveEvidence(evidence.get(), ctx.messages);
        evidence.update(() => retained);
        capturedOperations.update((operations) => [
          ...operations,
          ctx.operationId,
        ]);
      },
    },
  }),
});
