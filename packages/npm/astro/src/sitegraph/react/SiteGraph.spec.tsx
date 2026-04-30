import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SiteGraph } from './SiteGraph';
import { resetSiteGraphCache } from './cache';
import { setSiteGraphWorker } from './worker-client';
import type { SiteGraphData } from '../types';

const sample: SiteGraphData = {
	a: { title: 'Alpha', links: ['b', 'c'], backlinks: [] },
	b: { title: 'Beta', links: [], backlinks: ['a'] },
	c: { title: 'Gamma', links: [], backlinks: ['a'] },
	orphan: { title: 'Orphan', links: [], backlinks: [] },
};

function stubFetch(payload: unknown, ok = true) {
	vi.stubGlobal(
		'fetch',
		vi.fn(() =>
			Promise.resolve({
				ok,
				status: ok ? 200 : 500,
				json: () => Promise.resolve(payload),
			} as Response),
		),
	);
}

beforeEach(() => {
	resetSiteGraphCache();
	setSiteGraphWorker(null);
	if (typeof window !== 'undefined' && !window.matchMedia) {
		window.matchMedia = ((q: string) => ({
			matches: false,
			media: q,
			onchange: null,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			addListener: () => undefined,
			removeListener: () => undefined,
			dispatchEvent: () => false,
		})) as typeof window.matchMedia;
	}
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('SiteGraph', () => {
	it('renders an error + Retry button when the fetch fails', async () => {
		stubFetch(null, false);
		render(<SiteGraph currentSlug="a" />);
		const button = await screen.findByRole('button', { name: /retry/i });
		expect(button).toBeTruthy();
	});

	it('renders the empty state for a page with no neighborhood', async () => {
		stubFetch(sample);
		render(<SiteGraph currentSlug="missing-slug" />);
		expect(await screen.findByText(/no connections/i)).toBeTruthy();
	});

	it('renders the legend when 2+ tags are present', async () => {
		const taggedSample: SiteGraphData = {
			a: { title: 'A', links: ['b'], backlinks: [] },
			b: {
				title: 'B',
				links: [],
				backlinks: ['a'],
				edges: { 'osrs/x': 'product' },
			},
		};
		stubFetch(taggedSample);
		const { container } = render(
			<SiteGraph
				currentSlug="a"
				tagOf={(slug) => (slug === 'a' ? 'docs' : 'osrs')}
				tagStyles={{
					docs: { fill: '#fff', stroke: '#000', radius: 4 },
					osrs: { fill: '#eab308', stroke: '#a16207', radius: 4 },
				}}
				tagLabels={{ docs: 'Doc', osrs: 'OSRS' }}
			/>,
		);
		await waitFor(() => {
			expect(container.querySelector('.sg-legend')).toBeTruthy();
		});
		expect(screen.getByText('Doc')).toBeTruthy();
		expect(screen.getByText('OSRS')).toBeTruthy();
	});

	it('persists depth changes to localStorage', async () => {
		stubFetch(sample);
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		render(<SiteGraph currentSlug="a" />);
		await screen.findByLabelText(/Filter nodes/i);
		const select = screen.getByDisplayValue('2') as HTMLSelectElement;
		fireEvent.change(select, { target: { value: '3' } });
		await waitFor(() => {
			expect(setItem).toHaveBeenCalledWith('kbve-sitegraph-depth', '3');
		});
	});
});
