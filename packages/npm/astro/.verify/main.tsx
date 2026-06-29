import { createRoot } from 'react-dom/client';
import { SiteGraph } from '../src/sitegraph/react/SiteGraph';

const sample = {
	a: { title: 'Alpha', links: ['b', 'c', 'd'], backlinks: [] },
	b: { title: 'Beta', links: ['e'], backlinks: ['a'] },
	c: { title: 'Gamma', links: [], backlinks: ['a'] },
	d: { title: 'Delta', links: [], backlinks: ['a'] },
	e: { title: 'Epsilon', links: [], backlinks: ['b'] },
};

const realFetch = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
	if (String(input).includes('sitegraph')) {
		return Promise.resolve(
			new Response(JSON.stringify(sample), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);
	}
	return realFetch(input, init);
}) as typeof window.fetch;

const tagOf = (slug: string) =>
	slug === 'a' ? 'root' : slug === 'e' ? 'leaf' : 'mid';

createRoot(document.getElementById('root')!).render(
	<div style={{ width: 360, padding: 20 }}>
		<SiteGraph
			currentSlug="a"
			width={320}
			height={320}
			fixedSize
			tagOf={tagOf}
			tagStyles={{
				root: { fill: '#22d3ee', stroke: '#0891b2', radius: 6 },
				mid: { fill: '#a3a3a3', stroke: '#525252', radius: 4 },
				leaf: { fill: '#eab308', stroke: '#a16207', radius: 4 },
			}}
			tagLabels={{ root: 'Root', mid: 'Mid', leaf: 'Leaf' }}
		/>
	</div>,
);
