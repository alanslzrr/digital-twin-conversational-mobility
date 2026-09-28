import { z } from "zod";

export const conversationSessionId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
// Preserve PostgreSQL microseconds: Date/toISOString would lose cursor precision.
export const conversationCursor = z
  .object({
    createdAt: z.string().datetime({ precision: 6 }),
    sessionId: conversationSessionId,
  })
  .strict();
export const conversationListAction = z
  .object({
    action: z.literal("list_sessions"),
    principalId: z.string().uuid(),
    cursor: conversationCursor.optional(),
  })
  .strict();
export const conversationPage = z
  .object({
    sessions: z
      .array(
        z
          .object({
            sessionId: conversationSessionId,
            createdAt: z.string().datetime({ precision: 6 }),
            expiresAt: z.string().datetime({ precision: 6 }),
          })
          .strict(),
      )
      .max(20),
    nextCursor: conversationCursor.nullable(),
  })
  .strict();
export type ConversationPage = z.infer<typeof conversationPage>;
