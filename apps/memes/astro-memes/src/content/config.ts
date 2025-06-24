import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';
import { glob } from 'astro/loaders';


export const collections = {
	docs: defineCollection({
		schema: docsSchema({ }) }),
}