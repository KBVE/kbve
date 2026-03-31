import { useEffect, useRef } from 'react';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_ORDER,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

export default function ReactKanbanHeatmap({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const svgRef = useRef<SVGSVGElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !svgRef.current) return;
		rendered.current = true;

		// Collect all items with dates
		const dateCounts: Record<string, number> = {};
		for (const col of COLUMN_ORDER) {
			for (const item of data.columns[col] ?? []) {
				if (item.date) {
					dateCounts[item.date] = (dateCounts[item.date] ?? 0) + 1;
				}
			}
		}

		const dates = Object.keys(dateCounts).sort();
		if (dates.length === 0) return;

		// Build week grid (last 52 weeks)
		const today = new Date();
		const oneDay = 86400000;
		const weeks = 52;
		const cellSize = 18;
		const cellGap = 3;
		const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

		// Find start of grid (first Sunday, weeks*7 days ago)
		const startDate = new Date(today.getTime() - weeks * 7 * oneDay);
		startDate.setDate(startDate.getDate() - startDate.getDay()); // Align to Sunday

		const margin = { top: 20, left: 30 };
		const width = margin.left + weeks * (cellSize + cellGap) + 20;
		const height = margin.top + 7 * (cellSize + cellGap) + 30;

		// Max count for color scaling
		const maxCount = Math.max(...Object.values(dateCounts), 1);

		const svg = svgRef.current;
		while (svg.firstChild) svg.removeChild(svg.firstChild);
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

		// Day labels
		for (let d = 0; d < 7; d++) {
			if (!dayLabels[d]) continue;
			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			text.setAttribute('x', String(margin.left - 6));
			text.setAttribute(
				'y',
				String(margin.top + d * (cellSize + cellGap) + cellSize - 1),
			);
			text.setAttribute('text-anchor', 'end');
			text.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
			text.setAttribute('font-size', '8');
			text.textContent = dayLabels[d];
			svg.appendChild(text);
		}

		// Cells
		let idx = 0;
		for (let w = 0; w < weeks; w++) {
			for (let d = 0; d < 7; d++) {
				const cellDate = new Date(
					startDate.getTime() + (w * 7 + d) * oneDay,
				);
				if (cellDate > today) continue;

				const dateStr = cellDate.toISOString().slice(0, 10);
				const count = dateCounts[dateStr] ?? 0;

				const x = margin.left + w * (cellSize + cellGap);
				const y = margin.top + d * (cellSize + cellGap);

				// Color: gray-6 for 0, accent with increasing opacity for counts
				let fill: string;
				if (count === 0) {
					fill = 'var(--sl-color-gray-5, #262626)';
				} else {
					const intensity = Math.min(count / maxCount, 1);
					const alpha = 0.2 + intensity * 0.8;
					fill = `rgba(6, 182, 212, ${alpha.toFixed(2)})`;
				}

				const rect = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'rect',
				);
				rect.setAttribute('x', String(x));
				rect.setAttribute('y', String(y));
				rect.setAttribute('width', String(cellSize));
				rect.setAttribute('height', String(cellSize));
				rect.setAttribute('rx', '2');
				rect.setAttribute('fill', fill);
				rect.style.opacity = '0';
				rect.style.transition = `opacity 0.2s ease ${(idx * 0.002).toFixed(3)}s`;

				const title = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'title',
				);
				title.textContent = `${dateStr}: ${count} item${count !== 1 ? 's' : ''}`;
				rect.appendChild(title);
				svg.appendChild(rect);

				requestAnimationFrame(() => {
					rect.style.opacity = '1';
				});
				idx++;
			}
		}

		// Month labels
		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec',
		];
		let lastMonth = -1;
		for (let w = 0; w < weeks; w++) {
			const cellDate = new Date(startDate.getTime() + w * 7 * oneDay);
			const m = cellDate.getMonth();
			if (m !== lastMonth) {
				lastMonth = m;
				const text = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'text',
				);
				text.setAttribute(
					'x',
					String(margin.left + w * (cellSize + cellGap)),
				);
				text.setAttribute('y', String(margin.top - 6));
				text.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
				text.setAttribute('font-size', '8');
				text.textContent = months[m];
				svg.appendChild(text);
			}
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
				Activity Heatmap
			</h3>
			<svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto' }} />
		</div>
	);
}
