import { defineState } from "eve/context";
import { defineHook } from "eve/hooks";
import { budgetContext } from "../../src/budget-context";
import { captureTool, captureToolTerminal } from "../../src/telemetry";
import { admitTools, emptyToolBudget, finishTool } from "../../src/tool-budget";

const state = defineState("mobility.tool-budget.v1", () => emptyToolBudget(""));
export default defineHook({
  events: {
    "actions.requested": async (event) => {
      const current = state.get();
      const scope = budgetContext.get();
      let next: ReturnType<typeof admitTools>;
      try {
        next = admitTools(
          current.turnId === event.data.turnId
            ? current
            : emptyToolBudget(event.data.turnId),
          event.data.actions,
        );
      } catch (error) {
        if (scope)
          for (const action of event.data.actions)
            if (action.kind === "tool-call")
              await captureToolTerminal(
                scope,
                "tool_rejected",
                action.callId,
                action.toolName,
              );
        throw error;
      }
      state.update(() => next);
      if (scope)
        for (const action of event.data.actions)
          if (action.kind === "tool-call")
            await captureTool(
              scope,
              action.input,
              "tool_requested",
              action.callId,
              action.toolName,
            );
    },
    "action.result": async (event, ctx) => {
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
      const scope = budgetContext.get();
      if (scope && event.data.status === "rejected")
        await captureToolTerminal(
          scope,
          "tool_rejected",
          result.callId,
          result.toolName,
        );
      if (scope)
        await captureTool(
          scope,
          result.output,
          "tool_result",
          result.callId,
          result.toolName,
          event.data.status !== "completed" || result.isError === true,
        );
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
          callId: result.callId,
          failed: event.data.status !== "completed" || result.isError === true,
        }),
      );
    },
  },
});
