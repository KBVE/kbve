/**
 * Server-side Zod validation for discordsh edge functions.
 *
 * Mirrors the proto-generated SubmitServerRequestSchema from
 * packages/data/proto/discordsh.proto via discordsh-zod-config.json.
 * Kept in sync manually — regenerate client schema with:
 *   npx tsx packages/data/proto/gen-discordsh-zod.mjs
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

export const SubmitServerRequestSchema = z.object({
  server_id: z
    .string()
    .regex(/^\d{17,20}$/, "Must be a valid Discord snowflake (17-20 digits)"),
  name: z
    .string()
    .min(1, "Server name is required")
    .max(100, "Server name must be 100 characters or less"),
  summary: z
    .string()
    .min(1, "Summary is required")
    .max(200, "Summary must be 200 characters or less"),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or less")
    .optional(),
  icon_url: z.string().url("Must be a valid URL").optional(),
  banner_url: z.string().url("Must be a valid URL").optional(),
  invite_code: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{2,32}$/, "Invalid invite code format"),
  categories: z
    .array(z.number().int().min(1).max(12))
    .max(3, "Maximum 3 categories")
    .optional(),
  tags: z
    .array(z.string().min(1).max(50))
    .max(10, "Maximum 10 tags")
    .optional(),
  member_count: z.number().int().min(0).optional(),
});

export type SubmitServerRequest = z.infer<typeof SubmitServerRequestSchema>;
