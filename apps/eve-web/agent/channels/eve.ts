import { defineChannel } from "eve/channels";
import { eveChannel } from "eve/channels/eve";
import { protectEvaluationRoute } from "../../src/evaluation-guard";
import { readIdentity } from "../../src/evaluator-auth";

const channel = eveChannel({
  auth: [
    async (request) => {
      const identity = await readIdentity(request);
      return identity
        ? {
            authenticator: "evaluator-password",
            attributes: {},
            issuer: "mobility-evaluation",
            principalId: identity.principalId,
            principalType: "user" as const,
          }
        : null;
    },
  ],
  uploadPolicy: "disabled",
});

export default defineChannel({
  audience: () => "private",
  routes: channel.routes.map((route) => {
    if (route.transport === "websocket")
      throw new Error("Unexpected unprotected WebSocket route");
    return protectEvaluationRoute(route);
  }),
});
