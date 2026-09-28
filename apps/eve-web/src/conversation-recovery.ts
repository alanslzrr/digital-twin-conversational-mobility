/** EVE can finish an unknown session stream successfully with no messages. */
export function conversationUnavailable(input: {
  sessionId: string | undefined;
  status: string;
  messageCount: number;
}) {
  return (
    input.sessionId !== undefined &&
    input.messageCount === 0 &&
    input.status !== "resuming" &&
    input.status !== "submitted" &&
    input.status !== "streaming"
  );
}
