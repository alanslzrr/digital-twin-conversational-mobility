import { expect, it } from "vitest";
import { conversationUnavailable } from "./conversation-recovery";

it("treats an empty successful recovery as unavailable, not a new conversation", () => {
  expect(
    conversationUnavailable({
      sessionId: "missing",
      status: "ready",
      messageCount: 0,
    }),
  ).toBe(true);
  expect(
    conversationUnavailable({
      sessionId: "denied",
      status: "error",
      messageCount: 0,
    }),
  ).toBe(true);
});
it("keeps new chat, pending recovery and populated conversations native", () => {
  expect(
    conversationUnavailable({
      sessionId: undefined,
      status: "ready",
      messageCount: 0,
    }),
  ).toBe(false);
  for (const status of ["resuming", "submitted", "streaming"])
    expect(
      conversationUnavailable({ sessionId: "own", status, messageCount: 0 }),
    ).toBe(false);
  for (const status of ["ready", "error"])
    expect(
      conversationUnavailable({ sessionId: "own", status, messageCount: 2 }),
    ).toBe(false);
});
