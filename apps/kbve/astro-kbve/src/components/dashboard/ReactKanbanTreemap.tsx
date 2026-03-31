import { useEffect, useRef } from 'react';
import { treemap, hierarchy, treemapSquarify } from 'd3-hierarchy';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_COLORS,
	COLUMN_ORDER,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

export default function ReactKanbanTreemap({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const svgRef = useRef<SVGSVGElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !svgRef.current) return;
		rendered.current = true;

		const summary = data.summary;
		const children = COLUMN_ORDER.filter((k) => (summary[k] ?? 0) > 0).map(
			(k) => ({ name: k, value: summary[k], color: COLUMN_COLORS[k] }),
		);

		const width = 800;
		const height = 450;

		const root = hierarchy({ children }).sum((d: any) => d.value ?? 0);

		treemap<any>().size([width, height]).padding(3).tile(treemapSquarify)(
			root,
		);

		const svg = svgRef.current;
		while (svg.firstChild) svg.removeChild(svg.firstChild);

		const leaves = root.leaves();
		for (let i = 0; i < leaves.length; i++) {
			const leaf = leaves[i] as any;
			const g = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'g',
			);

			const rect = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			rect.setAttribute('x', String(leaf.x0));
			rect.setAttribute('y', String(leaf.y0));
			rect.setAttribute('width', String(leaf.x1 - leaf.x0));
			rect.setAttribute('height', String(leaf.y1 - leaf.y0));
			rect.setAttribute('rx', '6');
			rect.setAttribute('fill', leaf.data.color);
			rect.setAttribute('opacity', '0.85');
			rect.style.opacity = '0';
			rect.style.transition = `opacity 0.35s ease ${(i * 0.06).toFixed(2)}s`;
			g.appendChild(rect);

			const w = leaf.x1 - leaf.x0;
			const h = leaf.y1 - leaf.y0;

			// Name label
			if (w > 40 && h > 30) {
				const text = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'text',
				);
				text.setAttribute('x', String(leaf.x0 + 8));
				text.setAttribute('y', String(leaf.y0 + 18));
				text.setAttribute('fill', '#fff');
				text.setAttribute('font-size', w > 80 ? '12' : '10');
				text.setAttribute('font-weight', '600');
				text.style.pointerEvents = 'none';
				text.textContent = leaf.data.name;
				g.appendChild(text);
			}

			// Count label
			if (w > 30 && h > 45) {
				const countText = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'text',
				);
				countText.setAttribute('x', String(leaf.x0 + 8));
				countText.setAttribute('y', String(leaf.y0 + 34));
				countText.setAttribute('fill', 'rgba(255,255,255,0.7)');
				countText.setAttribute('font-size', w > 80 ? '11' : '9');
				countText.setAttribute('font-weight', '400');
				countText.style.pointerEvents = 'none';
				countText.textContent = `${leaf.data.value} items`;
				g.appendChild(countText);
			}

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `${leaf.data.name}: ${leaf.data.value} items`;
			g.appendChild(title);

			svg.appendChild(g);

			requestAnimationFrame(() => {
				rect.style.opacity = '0.85';
			});
		}
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
				Column Size Treemap
			</h3>
			<svg
				ref={svgRef}
				width={800}
				height={450}
				viewBox="0 0 800 450"
				style={{ maxWidth: '100%', height: 'auto', borderRadius: 10 }}
			/>
		</div>
	);
}
