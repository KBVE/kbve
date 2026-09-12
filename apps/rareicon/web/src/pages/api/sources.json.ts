import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { collectTermSummaries } from '@/lib/icons/terms';

export const prerender = true;

const PACK_META: Record<
	string,
	{ license: string; homeUrl: string; attribution: boolean }
> = {
	lucide: {
		license: 'ISC',
		homeUrl: 'https://lucide.dev/',
		attribution: true,
	},
	'simple-icons': {
		license: 'CC0',
		homeUrl: 'https://simpleicons.org/',
		attribution: false,
	},
	tabler: {
		license: 'MIT',
		homeUrl: 'https://tabler.io/icons',
		attribution: false,
	},
	phosphor: {
		license: 'MIT',
		homeUrl: 'https://phosphoricons.com/',
		attribution: false,
	},
	'game-icons': {
		license: 'CC BY 3.0',
		homeUrl: 'https://game-icons.net/',
		attribution: true,
	},
	heroicons: {
		license: 'MIT',
		homeUrl: 'https://heroicons.com/',
		attribution: false,
	},
	octicons: {
		license: 'MIT',
		homeUrl: 'https://primer.style/foundations/icons',
		attribution: false,
	},
	iconoir: {
		license: 'MIT',
		homeUrl: 'https://iconoir.com/',
		attribution: false,
	},
	carbon: {
		license: 'Apache 2.0',
		homeUrl: 'https://carbondesignsystem.com/guidelines/icons/library/',
		attribution: false,
	},
	'material-symbols': {
		license: 'Apache 2.0',
		homeUrl: 'https://fonts.google.com/icons',
		attribution: false,
	},
	fluent: {
		license: 'MIT',
		homeUrl: 'https://github.com/microsoft/fluentui-system-icons',
		attribution: false,
	},
	mdi: {
		license: 'Apache 2.0',
		homeUrl: 'https://pictogrammers.com/library/mdi/',
		attribution: false,
	},
	'akar-icons': {
		license: 'MIT',
		homeUrl: 'https://akaricons.com/',
		attribution: false,
	},
	'radix-icons': {
		license: 'MIT',
		homeUrl: 'https://www.radix-ui.com/icons',
		attribution: false,
	},
	'lucide-lab': {
		license: 'ISC',
		homeUrl: 'https://lucide.dev/lab',
		attribution: true,
	},
	solar: {
		license: 'CC BY 4.0',
		homeUrl: 'https://solar-icons.com/',
		attribution: true,
	},
	mingcute: {
		license: 'Apache 2.0',
		homeUrl: 'https://www.mingcute.com/',
		attribution: false,
	},
	devicon: {
		license: 'MIT',
		homeUrl: 'https://devicon.dev/',
		attribution: false,
	},
	logos: {
		license: 'CC0',
		homeUrl: 'https://svgporn.com/',
		attribution: false,
	},
};

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const terms = collectTermSummaries(docs);

	const counts = new Map<string, number>();
	for (const t of terms) {
		for (const pack of t.sourcePacks) {
			counts.set(pack, (counts.get(pack) ?? 0) + 1);
		}
	}

	const sources = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([name, termCount]) => ({
			name,
			termCount,
			...(PACK_META[name] ?? {
				license: 'unknown',
				homeUrl: '',
				attribution: false,
			}),
		}));

	const body = {
		generatedAt: new Date().toISOString(),
		count: sources.length,
		sources,
	};

	return new Response(JSON.stringify(body, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
};
