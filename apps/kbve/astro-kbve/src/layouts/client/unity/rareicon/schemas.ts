import { z } from 'zod';

// Enum for deployment statuses
export const DeploymentStatusEnum = z.enum(['success', 'blocked']);
export type DeploymentStatus = z.infer<typeof DeploymentStatusEnum>;

// Schema for deployable messages
export const DeployableMessageSchema = z.object({
  type: z.literal('deployable'),
  status: DeploymentStatusEnum,
  prefab: z.string(),
});
export type DeployableMessage = z.infer<typeof DeployableMessageSchema>;

// Discriminated union to allow more message types later
export const UnityBridgeSchema = z.discriminatedUnion('type', [
  DeployableMessageSchema,
]);
export type UnityBridgeMessage = z.infer<typeof UnityBridgeSchema>;
