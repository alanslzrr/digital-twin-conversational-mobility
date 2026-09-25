/** MCP text content remains compatible with clients without structured output support.
 * These tools declare no outputSchema: one JSON text is sufficient. Do not also
 * emit structuredContent, which EVE would send to the model a second time.
 */
export function mcpResult(value: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}
