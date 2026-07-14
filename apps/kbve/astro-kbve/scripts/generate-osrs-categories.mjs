/**
 * Generate the static OSRS category landing pages.
 *
 * One MDX doc per entry in src/data/osrs/categories.json, each rendering
 * <OSRSCategoryPanel> which server-lists the items carrying that tag. These are
 * the canonical /osrs/category/<slug>/ pages the rail deep-links into.
 *
 * Run: node scripts/generate-osrs-categories.mjs
 */

import { writeFile, mkdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATEGORIES = join(HERE, '../src/data/osrs/categories.json');
const OUT_DIR = join(HERE, '../src/content/docs/osrs/category');

function page(cat) {
	const frontmatter = [
		'---',
		`title: ${cat.label} | OSRS ${cat.group}`,
		'template: splash',
		`description: ${JSON.stringify(cat.blurb)}`,
		'---',
	].join('\n');

	return `${frontmatter}

import OSRSCategoryPanel from '@/components/osrs/OSRSCategoryPanel.astro';
import OSRSAdsenseCard from '@/components/osrs/OSRSAdsenseCard.astro';

<OSRSCategoryPanel slug="${cat.slug}" />

<OSRSAdsenseCard />
`;
}

async function main() {
	const raw = JSON.parse(await readFile(CATEGORIES, 'utf-8'));
	await mkdir(OUT_DIR, { recursive: true });

	for (const cat of raw.categories) {
		const file = join(OUT_DIR, `${cat.slug}.mdx`);
		await writeFile(file, page(cat), 'utf-8');
		console.log(`  + osrs/category/${cat.slug}.mdx`);
	}
	console.log(`\n✨ Wrote ${raw.categories.length} OSRS category pages.`);
}

main().catch((err) => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});
