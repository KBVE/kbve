import { z } from 'astro:content';

export const IScriptBindingSchema = z.object({
	guid: z.string().regex(/^[a-f0-9]{32}$/),
	vars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type ScriptBindingType = z.infer<typeof IScriptBindingSchema>;
