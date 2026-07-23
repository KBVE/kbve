import { describe, expect, it } from 'vitest';
import { buildGraphIndex, type GraphSources } from './buildGraphIndex';

const sources = (): GraphSources => ({
	nx: {
		graph: {
			nodes: {
				'axum-kbve': {
					type: 'app',
					data: { root: 'apps/kbve/axum-kbve' },
				},
				jedi: { type: 'lib', data: { root: 'packages/rust/jedi' } },
				kbve: { type: 'lib', data: { root: 'packages/rust/kbve' } },
			},
			dependencies: {
				'axum-kbve': [{ target: 'jedi' }, { target: 'kbve' }],
				kbve: [{ target: 'jedi' }],
				jedi: [],
			},
		},
	},
	graphify: {
		dirs: [
			{ id: 'apps__kbve', label: 'apps/kbve' },
			{ id: 'packages__rust', label: 'packages/rust' },
			{ id: '_github__scripts', label: '.github/scripts' },
		],
	},
	site: {
		'application/axum-kbve': { title: 'Axum KBVE', links: [] },
		'guides/unrelated': { title: 'Unrelated Guide', links: [] },
	},
});

describe('buildGraphIndex', () => {
	it('creates one entity per NX project with sorted deps and dependents', () => {
		const idx = buildGraphIndex(sources());
		const axum = idx.entities.find((e) => e.id === 'axum-kbve')!;
		expect(axum.kind).toBe('project');
		expect(axum.type).toBe('app');
		expect(axum.nx).toEqual({ deps: ['jedi', 'kbve'], dependents: [] });

		const jedi = idx.entities.find((e) => e.id === 'jedi')!;
		expect(jedi.nx!.dependents).toEqual(['axum-kbve', 'kbve']);
	});

	it('joins a project to its containing Graphify directory by path', () => {
		const idx = buildGraphIndex(sources());
		const axum = idx.entities.find((e) => e.id === 'axum-kbve')!;
		// root apps/kbve/axum-kbve → top-two apps/kbve bubble
		expect(axum.graphify).toEqual({
			dirId: 'apps__kbve',
			label: 'apps/kbve',
		});

		const jedi = idx.entities.find((e) => e.id === 'jedi')!;
		expect(jedi.graphify).toEqual({
			dirId: 'packages__rust',
			label: 'packages/rust',
		});
	});

	it('attaches a doc to a project when a slug segment matches its name', () => {
		const idx = buildGraphIndex(sources());
		const axum = idx.entities.find((e) => e.id === 'axum-kbve')!;
		expect(axum.docs).toEqual([
			{ slug: 'application/axum-kbve', title: 'Axum KBVE' },
		]);
	});

	it('does not emit unmatched docs as entities, only counts them', () => {
		const idx = buildGraphIndex(sources());
		expect(idx.entities.some((e) => e.kind === ('doc' as never))).toBe(
			false,
		);
		expect(idx.meta.counts.orphanDocs).toBe(1);
		expect(idx.meta.counts.docLinks).toBe(1);
	});

	it('keeps a Graphify directory no project claimed as a standalone dir entity', () => {
		const idx = buildGraphIndex(sources());
		const scripts = idx.entities.find(
			(e) => e.id === 'dir:_github__scripts',
		);
		expect(scripts).toBeDefined();
		expect(scripts!.kind).toBe('dir');
		expect(scripts!.graphify!.label).toBe('.github/scripts');
	});

	it('omits docs array on projects with no matched docs', () => {
		const idx = buildGraphIndex(sources());
		const kbve = idx.entities.find((e) => e.id === 'kbve')!;
		expect(kbve.docs).toBeUndefined();
	});

	it('reports gaps and counts when feeds are missing', () => {
		const idx = buildGraphIndex({ nx: null, graphify: null, site: null });
		expect(idx.meta.gaps.sort()).toEqual(['graphify', 'nx', 'site']);
		expect(idx.meta.counts.total).toBe(0);
		expect(idx.entities).toEqual([]);
	});

	it('counts entity kinds', () => {
		const idx = buildGraphIndex(sources());
		expect(idx.meta.counts.projects).toBe(3);
		expect(idx.meta.counts.dirs).toBe(1);
		expect(idx.meta.counts.docLinks).toBe(1);
		expect(idx.meta.counts.orphanDocs).toBe(1);
		expect(idx.meta.counts.total).toBe(4);
	});
});
