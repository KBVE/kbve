import { useEffect, useRef } from 'react';
import { arc, pie } from 'd3-shape';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_ORDER,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

const COLORS = [
	'#06b6d4',
	'#8b5cf6',
	'#22c55e',
	'#f59e0b',
	'#ef4444',
	'#3b82f6',
	'#f97316',
	'#ec4899',
	'#14b8a6',
	'#6366f1',
];

export default function ReactKanbanAssignees({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const rendered = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!active || !data || rendered.current || !containerRef.current)
			return;
		rendered.current = true;

		// Count items per assignee
		const assigneeCounts: Record<string, number> = {};
		let unassigned = 0;
		for (const col of COLUMN_ORDER) {
			for (const item of data.columns[col] ?? []) {
				if (item.assignees.length === 0) {
					unassigned++;
				} else {
					for (const a of item.assignees) {
						assigneeCounts[a] = (assigneeCounts[a] ?? 0) + 1;
					}
				}
			}
		}

		const sorted = Object.entries(assigneeCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);
		if (unassigned > 0) {
			sorted.push(['Unassigned', unassigned]);
		}

		const container = containerRef.current;

		// Left side: bar chart
		const barSvg = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'svg',
		);
		const barW = 500;
		const barH = sorted.length * 36 + 10;
		barSvg.setAttribute('viewBox', `0 0 ${barW} ${barH}`);
		barSvg.style.maxWidth = '100%';
		barSvg.style.height = 'auto';
		barSvg.style.flex = '1';
		barSvg.style.minWidth = '0';

		const maxCount = sorted[0]?.[1] ?? 1;
		const labelW = 120;
		const barAreaW = barW - labelW - 50;

		for (let i = 0; i < sorted.length; i++) {
			const [name, count] = sorted[i];
			const color = COLORS[i % COLORS.length];
			const y = i * 36 + 5;
			const w = (count / maxCount) * barAreaW;

			// Name
			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			text.setAttribute('x', String(labelW - 8));
			text.setAttribute('y', String(y + 20));
			text.setAttribute('text-anchor', 'end');
			text.setAttribute('fill', 'var(--sl-color-gray-3, #8b949e)');
			text.setAttribute('font-size', '11');
			text.setAttribute('font-weight', '500');
			text.textContent = name;
			barSvg.appendChild(text);

			// Bar
			const rect = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			rect.setAttribute('x', String(labelW));
			rect.setAttribute('y', String(y + 6));
			rect.setAttribute('width', '0');
			rect.setAttribute('height', '20');
			rect.setAttribute('rx', '4');
			rect.setAttribute('fill', color);
			rect.setAttribute('opacity', '0.8');
			rect.style.transition = `width 0.5s ease ${(i * 0.06).toFixed(2)}s`;
			barSvg.appendChild(rect);

			// Count
			const countText = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			countText.setAttribute('x', String(labelW + w + 8));
			countText.setAttribute('y', String(y + 20));
			countText.setAttribute('fill', 'var(--sl-color-text, #e6edf3)');
			countText.setAttribute('font-size', '11');
			countText.setAttribute('font-weight', '700');
			countText.textContent = String(count);
			barSvg.appendChild(countText);

			requestAnimationFrame(() => {
				rect.setAttribute('width', String(Math.max(w, 2)));
			});
		}

		// Right side: mini donut
		const donutSvg = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'svg',
		);
		const donutSize = 200;
		donutSvg.setAttribute('viewBox', `0 0 ${donutSize} ${donutSize}`);
		donutSvg.style.width = `${donutSize}px`;
		donutSvg.style.height = `${donutSize}px`;
		donutSvg.style.flexShrink = '0';

		const pieGen = pie<[string, number]>()
			.value((d) => d[1])
			.sort(null);
		const arcGen = arc<any>()
			.innerRadius(donutSize * 0.35)
			.outerRadius(donutSize / 2 - 4);
		const arcs = pieGen(sorted);

		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute(
			'transform',
			`translate(${donutSize / 2},${donutSize / 2})`,
		);
		donutSvg.appendChild(g);

		for (const d of arcs) {
			const path = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'path',
			);
			path.setAttribute('d', arcGen(d) ?? '');
			path.setAttribute('fill', COLORS[d.index % COLORS.length]);
			path.setAttribute('stroke', 'var(--sl-color-bg-nav, #111)');
			path.setAttribute('stroke-width', '2');
			path.setAttribute('opacity', '0.85');

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `${d.data[0]}: ${d.data[1]}`;
			path.appendChild(title);
			g.appendChild(path);
		}

		// Center text
		const centerText = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		centerText.setAttribute('text-anchor', 'middle');
		centerText.setAttribute('y', '-2');
		centerText.setAttribute('fill', 'var(--sl-color-text, #e6edf3)');
		centerText.setAttribute('font-size', '20');
		centerText.setAttribute('font-weight', '700');
		centerText.textContent = String(sorted.length);
		g.appendChild(centerText);

		const subText = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		subText.setAttribute('text-anchor', 'middle');
		subText.setAttribute('y', '14');
		subText.setAttribute('fill', 'var(--sl-color-gray-3, #8b949e)');
		subText.setAttribute('font-size', '8');
		subText.textContent = 'CONTRIBUTORS';
		g.appendChild(subText);

		// Layout wrapper
		const wrapper = document.createElement('div');
		wrapper.style.cssText =
			'display:flex;align-items:center;gap:2rem;justify-content:center;width:100%;flex-wrap:wrap;';
		wrapper.appendChild(barSvg);
		wrapper.appendChild(donutSvg);
		container.appendChild(wrapper);
	}, [active, data]);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '1rem',
				width: '100%',
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
				Contributors
			</h3>
			<div ref={containerRef} style={{ width: '100%', maxWidth: 800 }} />
		</div>
	);
}
