import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { docsLoader } from '@astrojs/starlight/loaders';
import { glob } from 'astro/loaders';

import { AstroIconTermSchema, AstroIconCollectionSchema } from '@/data/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema(),
	}),
	icons: defineCollection({
		loader: glob({
			pattern: '**/*.{md,mdx}',
			base: './src/content/icons',
		}),
		schema: AstroIconTermSchema,
	}),
	iconCollections: defineCollection({
		loader: glob({
			pattern: '**/*.{md,mdx}',
			base: './src/content/iconCollections',
		}),
		schema: AstroIconCollectionSchema,
	}),
};
