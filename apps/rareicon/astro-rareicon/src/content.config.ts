import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { docsLoader } from '@astrojs/starlight/loaders';

import { IconTermOverlaySchema } from '@/data/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		// Extend Starlight's docsSchema with IconTerm fields so icon MDX pages
		// under src/content/docs/icons/ validate + render automatically through
		// Starlight's layout + Pagefind + sidebar.
		schema: docsSchema({ extend: IconTermOverlaySchema }),
	}),
};
