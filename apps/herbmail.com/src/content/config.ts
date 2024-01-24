import { z, defineCollection } from 'astro:content';

//*         [Tools]
const tools = defineCollection({
    schema: z.object({
      title: z.string(),
      description: z.string(),
      js_integrity: z.string().optional(),
      js_file: z.string().optional(),
      wasm_integrity: z.string().optional(),
      wasm_file:  z.string().optional()
    }),
  });

  
export const collections = {

    tools: tools,
}