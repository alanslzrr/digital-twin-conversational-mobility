import { defineDynamic, defineInstructions } from "eve/instructions";
import { turnClock } from "../../src/turn-clock";

export default defineDynamic({
  events: {
    "turn.started": () => defineInstructions({ content: turnClock() }),
  },
});
