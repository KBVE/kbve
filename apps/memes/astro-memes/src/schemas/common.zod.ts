import { z } from 'zod';

export const ResultSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	code: z.number().int(),
});
export type Result = z.infer<typeof ResultSchema>;
