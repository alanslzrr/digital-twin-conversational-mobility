/** Byte measurements of the actual provider payload. Bytes are not token estimates. */
export function contextFootprint(body: Record<string, unknown>) {
  const bytes = (value: unknown) =>
    Buffer.byteLength(JSON.stringify(value ?? null));
  const inputs = Array.isArray(body.input) ? body.input : [];
  let toolOutputBytes = 0;
  let duplicatedStructuredResults = 0;
  let duplicatedStructuredBytes = 0;
  for (const input of inputs) {
    if (
      !input ||
      typeof input !== "object" ||
      input.type !== "function_call_output"
    )
      continue;
    toolOutputBytes += bytes(input.output);
    if (typeof input.output !== "string") continue;
    try {
      const result = JSON.parse(input.output);
      if (!result.structuredContent || !Array.isArray(result.content)) continue;
      const duplicate = result.content.some(
        (part: { type?: string; text?: string }) => {
          if (part.type !== "text" || typeof part.text !== "string")
            return false;
          try {
            return (
              JSON.stringify(JSON.parse(part.text)) ===
              JSON.stringify(result.structuredContent)
            );
          } catch {
            return false;
          }
        },
      );
      if (duplicate) {
        duplicatedStructuredResults++;
        duplicatedStructuredBytes += bytes(result.structuredContent);
      }
    } catch {
      /* Non-JSON tool output has no demonstrated structured duplication. */
    }
  }
  return {
    payloadBytes: bytes(body),
    inputBytes: bytes(body.input),
    instructionsBytes: bytes(body.instructions),
    toolCatalogBytes: bytes(body.tools),
    toolDefinitions: Array.isArray(body.tools) ? body.tools.length : 0,
    toolOutputBytes,
    duplicatedStructuredResults,
    duplicatedStructuredBytes,
  };
}
