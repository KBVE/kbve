import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';
import { glob } from 'astro/loaders';

import type { CategoryName } from 'src/data/types';
import { ItemCategoryFlags, getCategoryValue } from 'src/data/types';

import {
	ICraftingSchema,
	IDeployableSchema,
	IScriptBindingSchema,
	IBonusSchema,
	IObjectSchema,
	IQuestSchema,
	IMapObjectSchema,
} from 'src/data/schema';

export function validateItemUniqueness(
	items: (typeof IObjectSchema)['_type'][],
) {
	const seenIds = new Set<string>();
	const seenKeys = new Set<number>();
	const seenRefs = new Set<string>();

	for (const item of items) {
		if (seenIds.has(item.id)) {
			throw new Error(`Duplicate id detected: ${item.id}`);
		}
		if (seenKeys.has(item.key)) {
			throw new Error(`Duplicate key detected: ${item.key}`);
		}
		if (seenRefs.has(item.ref)) {
			throw new Error(`Duplicate ref detected: ${item.ref}`);
		}
		seenIds.add(item.id);
		seenKeys.add(item.key);
		seenRefs.add(item.ref);
	}
}

const application = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/application' })
});

const project = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/project' })
});

const itemdb = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/itemdb' }),
	schema: IObjectSchema,
});

const questdb = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/questdb' }),
	schema: IQuestSchema,
});
const mapdb = defineCollection({
	loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/mapdb' }),
	schema: IMapObjectSchema,
});


export const collections = {
	docs: defineCollection({
		schema: docsSchema({
			extend: pageSiteGraphSchema.merge(
				z.object({
					itemdb: z.array(IObjectSchema).optional(),
					questdb: z.array(IQuestSchema).optional(),
					mapdb: z.array(IMapObjectSchema).optional(),
				}),
			),
		}),
	}),
	itemdb: itemdb,
	questdb: questdb,
	application: application,
	project: project,
	mapdb: mapdb,
};
