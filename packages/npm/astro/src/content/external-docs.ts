import { glob, type Loader, type LoaderContext } from 'astro/loaders';

export interface ExternalDocsSection {
	prefix: string;
	base: string;
}

const DOCS_EXTENSIONS = [
	'markdown',
	'mdown',
	'mkdn',
	'mkd',
	'mdwn',
	'md',
	'mdx',
];

const DOCS_PATTERN = `**/[^_]*.{${DOCS_EXTENSIONS.join(',')}}`;

function slugifySegment(segment: string): string {
	return segment
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-zA-Z0-9._~-]/g, '')
		.toLowerCase();
}

export function externalDocsId(entry: string, prefix: string): string {
	const segments = entry
		.replace(/\.[^./]+$/, '')
		.split('/')
		.map(slugifySegment)
		.filter(Boolean);
	if (segments.at(-1) === 'index') segments.pop();
	return [prefix, ...segments].join('/');
}

function ownsId(id: string, prefix: string): boolean {
	return id === prefix || id.startsWith(`${prefix}/`);
}

function scopeStore(
	store: LoaderContext['store'],
	owns: (id: string) => boolean,
): LoaderContext['store'] {
	return new Proxy(store, {
		get(target, property, receiver) {
			if (property === 'keys') {
				return () => [...target.keys()].filter(owns);
			}
			const value = Reflect.get(target, property, receiver);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
}

export function withExternalDocs(
	base: Loader,
	sections: ExternalDocsSection[],
): Loader {
	const external = sections.map((section) => ({
		owns: (id: string) => ownsId(id, section.prefix),
		loader: glob({
			base: section.base,
			pattern: DOCS_PATTERN,
			generateId: ({ entry, data }) =>
				data.slug
					? String(data.slug)
					: externalDocsId(entry, section.prefix),
		}),
	}));

	const local = {
		owns: (id: string) => !external.some(({ owns }) => owns(id)),
		loader: base,
	};

	return {
		name: 'kbve-external-docs-loader',
		load: async (context) => {
			for (const { owns, loader } of [local, ...external]) {
				await loader.load({
					...context,
					store: scopeStore(context.store, owns),
				});
			}
		},
	};
}
