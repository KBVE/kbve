import { z } from 'zod';

export const DeployableMessageSchema = z.object({
  type: z.literal('deployable'),
  status: z.union([z.literal('success'), z.literal('blocked')]),
  prefab: z.string(),
});

export const UnityBridgeSchema = z.discriminatedUnion('type', [
  DeployableMessageSchema,
]);

export type UnityBridgeMessage = z.infer<typeof UnityBridgeSchema>;
export type DeployableMessage = z.infer<typeof DeployableMessageSchema>;
