import { useEffect, useState } from 'react';

interface SiteGraphNode {
	title: string;
	links: string[];
	backlinks: string[];
}

type SiteGraphData = Record<string, SiteGraphNode>;

interface BacklinksProps {
	currentSlug: string;
}

export default function Backlinks({ currentSlug }: BacklinksProps) {
	const [backlinks, setBacklinks] = useState<Array<{
		slug: string;
		title: string;
	}> | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/sitegraph.json')
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: SiteGraphData) => {
				if (cancelled) return;
				const node = data[currentSlug];
				if (!node?.backlinks?.length) {
					setBacklinks([]);
					return;
				}
				setBacklinks(
					node.backlinks
						.filter((slug) => data[slug])
						.map((slug) => ({
							slug,
							title: data[slug].title,
						}))
						.sort((a, b) => a.title.localeCompare(b.title)),
				);
			})
			.catch(() => {
				if (!cancelled) setBacklinks([]);
			});
		return () => {
			cancelled = true;
		};
	}, [currentSlug]);

	if (backlinks === null) return null;
	if (backlinks.length === 0) return null;

	return (
		<div className="sg-backlinks">
			<h3
				style={{
					fontSize: '12px',
					fontWeight: 600,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					color: 'var(--sl-color-gray-3)',
					margin: '0 0 8px 0',
				}}>
				Backlinks
			</h3>
			<ul
				style={{
					listStyle: 'none',
					padding: 0,
					margin: 0,
					display: 'flex',
					flexDirection: 'column',
					gap: '4px',
				}}>
				{backlinks.map(({ slug, title }) => (
					<li key={slug}>
						<a
							href={`/${slug}/`}
							style={{
								fontSize: '13px',
								color: 'var(--sl-color-text-accent)',
								textDecoration: 'none',
							}}>
							{title}
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
