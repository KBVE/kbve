import { useEffect, useRef } from 'react';
import { scaleTime, scaleLinear } from 'd3-scale';
import { extent } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_COLORS,
	COLUMN_ORDER,
	type KanbanItem,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

export default function ReactKanbanTimeline({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const svgRef = useRef<SVGSVGElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !svgRef.current) return;
		rendered.current = true;

		// Flatten all items with dates, excluding Done (too many)
		const items: (KanbanItem & { column: string })[] = [];
		for (const col of COLUMN_ORDER) {
			if (col === 'Done') continue;
			for (const item of data.columns[col] ?? []) {
				if (item.date) {
					items.push({ ...item, column: col });
				}
			}
		}

		if (items.length === 0) return;

		const width = 900;
		const height = 400;
		const margin = { top: 20, right: 20, bottom: 40, left: 20 };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const dates = items.map((d) => new Date(d.date));
		const [minDate, maxDate] = extent(dates) as [Date, Date];

		const xScale = scaleTime()
			.domain([minDate, maxDate])
			.range([0, innerW]);

		// Vertical: group by column, spread within band
		const colIndex = new Map(
			COLUMN_ORDER.filter((c) => c !== 'Done').map((c, i) => [c, i]),
		);
		const colCount = colIndex.size;
		const yScale = scaleLinear()
			.domain([0, colCount - 1])
			.range([0, innerH]);

		const svg = svgRef.current;
		while (svg.firstChild) svg.removeChild(svg.firstChild);

		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
		svg.appendChild(g);

		// X axis ticks
		const fmt = timeFormat('%b %Y');
		const ticks = xScale.ticks(6);
		for (const tick of ticks) {
			const x = xScale(tick);
			const line = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'line',
			);
			line.setAttribute('x1', String(x));
			line.setAttribute('x2', String(x));
			line.setAttribute('y1', '0');
			line.setAttribute('y2', String(innerH));
			line.setAttribute('stroke', 'var(--sl-color-gray-5, #262626)');
			line.setAttribute('stroke-width', '1');
			g.appendChild(line);

			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			text.setAttribute('x', String(x));
			text.setAttribute('y', String(innerH + 20));
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
			text.setAttribute('font-size', '9');
			text.textContent = fmt(tick);
			g.appendChild(text);
		}

		// Column labels on right
		for (const [col, idx] of colIndex) {
			const y = yScale(idx);
			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			text.setAttribute('x', String(innerW + 4));
			text.setAttribute('y', String(y + 3));
			text.setAttribute('fill', COLUMN_COLORS[col]);
			text.setAttribute('font-size', '8');
			text.setAttribute('font-weight', '600');
			text.textContent = col;
			g.appendChild(text);
		}

		// Plot items
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const x = xScale(new Date(item.date));
			const y = yScale(colIndex.get(item.column) ?? 0);
			const jitter = (Math.random() - 0.5) * 12;

			const circle = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'circle',
			);
			circle.setAttribute('cx', String(x));
			circle.setAttribute('cy', String(y + jitter));
			circle.setAttribute('r', '4');
			circle.setAttribute(
				'fill',
				COLUMN_COLORS[item.column] ?? '#6b7280',
			);
			circle.setAttribute('opacity', '0.8');
			circle.style.opacity = '0';
			circle.style.transition = `opacity 0.3s ease ${(i * 0.02).toFixed(2)}s`;

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `#${item.number} ${item.title} (${item.date})`;
			circle.appendChild(title);
			g.appendChild(circle);

			requestAnimationFrame(() => {
				circle.style.opacity = '0.8';
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
				Items by Date
			</h3>
			<svg
				ref={svgRef}
				width={900}
				height={400}
				viewBox="0 0 900 400"
				style={{ maxWidth: '100%', height: 'auto' }}
			/>
		</div>
	);
}
