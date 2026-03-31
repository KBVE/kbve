import { useEffect, useRef } from 'react';
import { arc, pie } from 'd3-shape';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_COLORS,
	COLUMN_ORDER,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

export default function ReactKanbanDonut({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const svgRef = useRef<SVGSVGElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !svgRef.current) return;
		rendered.current = true;

		const summary = data.summary;
		const entries = COLUMN_ORDER.filter((k) => (summary[k] ?? 0) > 0).map(
			(k) => ({ name: k, value: summary[k], color: COLUMN_COLORS[k] }),
		);

		const width = 420;
		const height = 420;
		const radius = Math.min(width, height) / 2;
		const innerRadius = radius * 0.55;

		const pieGen = pie<(typeof entries)[0]>()
			.value((d) => d.value)
			.sort(null);
		const arcGen = arc<any>()
			.innerRadius(innerRadius)
			.outerRadius(radius - 4);
		const arcs = pieGen(entries);

		const svg = svgRef.current;
		// Clear any existing content
		while (svg.firstChild) svg.removeChild(svg.firstChild);

		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('transform', `translate(${width / 2},${height / 2})`);
		svg.appendChild(g);

		for (const d of arcs) {
			const path = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'path',
			);
			path.setAttribute('d', arcGen(d) ?? '');
			path.setAttribute('fill', d.data.color);
			path.setAttribute('stroke', 'var(--sl-color-bg-nav, #111)');
			path.setAttribute('stroke-width', '2');
			path.style.opacity = '0';
			path.style.transition = `opacity 0.4s ease ${(d.index * 0.08).toFixed(2)}s`;

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `${d.data.name}: ${d.data.value}`;
			path.appendChild(title);
			g.appendChild(path);

			// Trigger fade-in
			requestAnimationFrame(() => {
				path.style.opacity = '1';
			});
		}

		// Center label
		const total = entries.reduce((s, e) => s + e.value, 0);
		const text1 = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		text1.setAttribute('text-anchor', 'middle');
		text1.setAttribute('y', '-6');
		text1.setAttribute('fill', 'var(--sl-color-text, #e6edf3)');
		text1.setAttribute('font-size', '36');
		text1.setAttribute('font-weight', '700');
		text1.textContent = String(total);
		g.appendChild(text1);

		const text2 = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		text2.setAttribute('text-anchor', 'middle');
		text2.setAttribute('y', '16');
		text2.setAttribute('fill', 'var(--sl-color-gray-3, #8b949e)');
		text2.setAttribute('font-size', '11');
		text2.setAttribute('font-weight', '500');
		text2.textContent = 'TOTAL ITEMS';
		g.appendChild(text2);
	}, [active, data]);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '1rem',
			}}>
			<h3
				style={{
					margin: 0,
					fontSize: '0.8rem',
					fontWeight: 600,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					color: 'var(--sl-color-gray-3, #8b949e)',
				}}>
				Column Distribution
			</h3>
			<svg
				ref={svgRef}
				width={420}
				height={420}
				viewBox="0 0 420 420"
				style={{ maxWidth: '100%', height: 'auto' }}
			/>
		</div>
	);
}
