import { defineHook } from "eve/hooks";
import { conversationMetric } from "../../src/conversation-metrics";

export default defineHook({
  events: {
    "*": (event, ctx) => {
      const metric = conversationMetric(event, ctx.session.id);
      if (metric)
        console.info(
          JSON.stringify({ kind: "mobility.conversation.metric", ...metric }),
        );
    },
  },
});
