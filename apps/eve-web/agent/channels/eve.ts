import { llmId } from "@mobility/contracts";
import { defineChannel } from "eve/channels";
import { eveChannel } from "eve/channels/eve";
import { evaluationCaller } from "../../src/evaluation-caller";
import { protectEvaluationRoute } from "../../src/evaluation-guard";

const channel = eveChannel({
  auth: [evaluationCaller],
  uploadPolicy: "disabled",
  onMessage: async ({ eve }) => {
    const caller = eve.caller;
    if (!caller) throw new Error("authentication_required");
    const selectionId = llmId.parse(
      eve.request.headers.get("x-mobai-selection"),
    );
    return {
      auth: { ...caller, attributes: { mobaiSelectionId: selectionId } },
    };
  },
});

export default defineChannel({
  audience: () => "private",
  routes: channel.routes.map((route) => {
    if (route.transport === "websocket")
      throw new Error("Unexpected unprotected WebSocket route");
    return protectEvaluationRoute(route);
  }),
});
