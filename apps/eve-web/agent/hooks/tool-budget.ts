import { defineState } from "eve/context";
import { defineHook } from "eve/hooks";
import { admitTools, emptyToolBudget, finishTool } from "../../src/tool-budget";

const state = defineState("mobility.tool-budget.v1", () => emptyToolBudget(""));
export default defineHook({
  events: {
    "actions.requested": (event) => {
      const current = state.get();
      const next = admitTools(
        current.turnId === event.data.turnId
          ? current
          : emptyToolBudget(event.data.turnId),
        event.data.actions,
      );
      state.update(() => next);
    },
    "action.result": (event, ctx) => {
      const result = event.data.result;
      if (result.kind !== "tool-result")
        throw new Error("Unbudgeted tool result");
      const next = finishTool(
        state.get(),
        result.callId,
        result.output,
        event.data.status !== "completed" || result.isError === true,
      );
      state.update(() => next);
      const output = result.output;
      const structured: Record<string, unknown> =
        output && typeof output === "object" && !Array.isArray(output)
          ? (output as Record<string, unknown>)
          : {};
      console.info(
        JSON.stringify({
          kind: "mobility.tool.metric",
          sessionId: ctx.session.id,
          turnId: event.data.turnId,
          sequence: event.data.sequence,
          tool: result.toolName,
          resultBytes: Buffer.byteLength(JSON.stringify(output)),
          contentBytes: Buffer.byteLength(
            JSON.stringify(structured.content ?? null),
          ),
          structuredContentBytes: Buffer.byteLength(
            JSON.stringify(structured.structuredContent ?? null),
          ),
          failed: event.data.status !== "completed",
        }),
      );
    },
  },
});
