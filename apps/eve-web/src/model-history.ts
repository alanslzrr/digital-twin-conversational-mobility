import type { LanguageModelMiddleware } from "ai";

export function providerHistory(providerId: string): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params,
      prompt: params.prompt.map((message) => {
        const { providerOptions: _messageOptions, ...withoutOptions } = message;
        if (message.role !== "assistant") {
          if (typeof message.content === "string") return withoutOptions;
          return {
            ...withoutOptions,
            content: message.content.map((part) => {
              const { providerOptions: _options, ...content } = part;
              return content;
            }),
          } as typeof message;
        }
        return {
          role: "assistant" as const,
          content: message.content.flatMap((part) => {
            const sameProvider =
              part.providerOptions?.mobai?.providerId === providerId;
            if (part.type === "reasoning" && !sameProvider) return [];
            const { providerOptions: _options, ...content } = part;
            return [sameProvider ? part : content];
          }),
        };
      }),
    }),
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return {
        ...result,
        content: result.content.map((part) => ({
          ...part,
          providerMetadata: { ...part.providerMetadata, mobai: { providerId } },
        })),
      };
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (
                part.type === "text-start" ||
                part.type === "text-end" ||
                part.type === "reasoning-start" ||
                part.type === "reasoning-end" ||
                part.type === "tool-call"
              ) {
                controller.enqueue({
                  ...part,
                  providerMetadata: {
                    ...("providerMetadata" in part
                      ? part.providerMetadata
                      : {}),
                    mobai: { providerId },
                  },
                });
              } else controller.enqueue(part);
            },
          }),
        ),
      };
    },
  };
}
