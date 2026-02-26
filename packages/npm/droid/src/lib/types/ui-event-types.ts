import { z } from 'zod';
import type { VirtualNode } from './modules';

// Recursive VirtualNode schema matching the type in modules.ts.
// Validates worker-produced descriptors at runtime.
const VirtualNodeSchema: z.ZodType<VirtualNode> = z.lazy(() =>
	z.object({
		tag: z.string(),
		id: z.string().optional(),
		key: z.string().optional(),
		class: z.string().optional(),
		attrs: z.record(z.any()).optional(),
		style: z.record(z.string()).optional(),
		children: z.array(z.union([z.string(), VirtualNodeSchema])).optional(),
	}),
);

// ── Toast ──

export const ToastSeveritySchema = z.enum([
	'success',
	'warning',
	'error',
	'info',
]);
export type ToastSeverity = z.infer<typeof ToastSeveritySchema>;

export const ToastPayloadSchema = z.object({
	id: z.string(),
	message: z.string(),
	severity: ToastSeveritySchema,
	duration: z.number().positive().optional(),
	vnode: VirtualNodeSchema.optional(),
});
export type ToastPayload = z.infer<typeof ToastPayloadSchema>;

// ── Tooltip ──

export const TooltipPositionSchema = z.enum([
	'top',
	'bottom',
	'left',
	'right',
	'auto',
]);
export type TooltipPosition = z.infer<typeof TooltipPositionSchema>;

export const TooltipPayloadSchema = z.object({
	id: z.string(),
	content: z.union([z.string(), VirtualNodeSchema]).optional(),
	position: TooltipPositionSchema.optional(),
	anchor: z.string().optional(),
});
export type TooltipPayload = z.infer<typeof TooltipPayloadSchema>;

// ── Modal ──

export const ModalPayloadSchema = z.object({
	id: z.string(),
	content: VirtualNodeSchema.optional(),
	title: z.string().optional(),
	metadata: z.record(z.any()).optional(),
});
export type ModalPayload = z.infer<typeof ModalPayloadSchema>;

export { VirtualNodeSchema };
