import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
// Removed starlight-site-graph schema import as it's causing build issues
import { glob } from 'astro/loaders';


export const collections = {
	docs: defineCollection({
		schema: docsSchema({ }) }),
}