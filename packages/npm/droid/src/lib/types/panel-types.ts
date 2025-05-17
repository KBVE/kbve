import { z } from 'zod';

export const PanelIdSchema = z.enum(['top', 'right', 'bottom', 'left']);
export type PanelId = z.infer<typeof PanelIdSchema>;

export const CanvasOptionsSchema = z.object({
	width: z.number(),
	height: z.number(),
	mode: z.enum(['static', 'animated', 'dynamic']).optional(),
});

export const PanelPayloadSchema = z.object({
	rawHtml: z.string().optional(),
	needsCanvas: z.boolean().optional(),
	canvasOptions: CanvasOptionsSchema.optional(),
});

export type PanelPayload = z.infer<typeof PanelPayloadSchema>;