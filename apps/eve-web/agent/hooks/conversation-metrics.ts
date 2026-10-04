import { defineHook } from "eve/hooks";
import { conversationMetric } from "../../src/conversation-metrics";
import { captureLifecycle } from "../../src/telemetry";

export default defineHook({
  events: {
    "*": async (event, ctx) => {
      await captureLifecycle(event, ctx.session.id);
      const metric = conversationMetric(event, ctx.session.id);
      if (metric)
        console.info(
          JSON.stringify({ kind: "mobility.conversation.metric", ...metric }),
        );
    },
  },
});
