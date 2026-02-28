import { z } from 'astro:content';
import { IScriptBindingSchema } from './IScriptBindingSchema';

export const IDeployableSchema = z.object({
	size: z
		.tuple([z.number().int().min(1), z.number().int().min(1)])
		.default([1, 1]),
	pivot: z
		.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
		.optional()
		.default([0.5, 0.5]),
	overridePrefab: z.string().optional(),
	scripts: z.array(z.string()).optional(),
	scaleMultiplier: z.number().positive().optional().default(1),
	gridSnap: z.boolean().optional().default(true),
	scriptBindings: z.array(IScriptBindingSchema).optional(),
});

export type DeployableType = z.infer<typeof IDeployableSchema>;
