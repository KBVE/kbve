import { useEffect, useRef, useState } from 'react';
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
	const containerRef = useRef<HTMLDivElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !containerRef.current)
			return;
		rendered.current = true;

		const container = containerRef.current;

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

		// Measure container width to compute cell size
		const containerWidth = container.offsetWidth;
		const weeks = 52;
		const marginLeft = 40;
		const marginRight = 10;
		const availableWidth = containerWidth - marginLeft - marginRight;

		// Compute cell size to fill width
		const cellGap = 3;
		const cellSize = Math.max(
			Math.floor((availableWidth - (weeks - 1) * cellGap) / weeks),
			8,
		);

		const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

		// Find start of grid (first Sunday, weeks*7 days ago)
		const today = new Date();
		const oneDay = 86400000;
		const startDate = new Date(today.getTime() - weeks * 7 * oneDay);
		startDate.setDate(startDate.getDate() - startDate.getDay());

		const marginTop = 28;
		const width = marginLeft + weeks * (cellSize + cellGap);
		const height = marginTop + 7 * (cellSize + cellGap) + 40;

		const maxCount = Math.max(...Object.values(dateCounts), 1);

		// Create SVG
		const svg = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'svg',
		);
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		svg.style.display = 'block';
		svg.style.margin = '0 auto';

		// Day labels
		const fontSize = Math.max(cellSize * 0.55, 9);
		for (let d = 0; d < 7; d++) {
			if (!dayLabels[d]) continue;
			const text = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'text',
			);
			text.setAttribute('x', String(marginLeft - 8));
			text.setAttribute(
				'y',
				String(marginTop + d * (cellSize + cellGap) + cellSize * 0.75),
			);
			text.setAttribute('text-anchor', 'end');
			text.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
			text.setAttribute('font-size', String(fontSize));
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

				const x = marginLeft + w * (cellSize + cellGap);
				const y = marginTop + d * (cellSize + cellGap);

				let fill: string;
				if (count === 0) {
					fill = 'var(--sl-color-gray-5, #262626)';
				} else {
					const intensity = Math.min(count / maxCount, 1);
					const alpha = 0.25 + intensity * 0.75;
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
				rect.setAttribute('rx', String(Math.max(cellSize * 0.15, 2)));
				rect.setAttribute('fill', fill);
				rect.style.opacity = '0';
				rect.style.transition = `opacity 0.15s ease ${(idx * 0.001).toFixed(3)}s`;

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
					String(marginLeft + w * (cellSize + cellGap)),
				);
				text.setAttribute('y', String(marginTop - 10));
				text.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
				text.setAttribute('font-size', String(fontSize));
				text.textContent = months[m];
				svg.appendChild(text);
			}
		}

		// Legend
		const legendY = height - 18;
		const legendX = width - 200;
		const legendLabel = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		legendLabel.setAttribute('x', String(legendX));
		legendLabel.setAttribute('y', String(legendY + 10));
		legendLabel.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
		legendLabel.setAttribute('font-size', String(fontSize));
		legendLabel.textContent = 'Less';
		svg.appendChild(legendLabel);

		const legendSteps = 5;
		for (let s = 0; s < legendSteps; s++) {
			const lx = legendX + 35 + s * (cellSize * 0.7 + 2);
			const alpha = s === 0 ? 0 : 0.25 + (s / (legendSteps - 1)) * 0.75;
			const lRect = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			lRect.setAttribute('x', String(lx));
			lRect.setAttribute('y', String(legendY));
			lRect.setAttribute('width', String(cellSize * 0.7));
			lRect.setAttribute('height', String(cellSize * 0.7));
			lRect.setAttribute('rx', '2');
			lRect.setAttribute(
				'fill',
				s === 0
					? 'var(--sl-color-gray-5, #262626)'
					: `rgba(6, 182, 212, ${alpha.toFixed(2)})`,
			);
			svg.appendChild(lRect);
		}

		const moreLabel = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		moreLabel.setAttribute(
			'x',
			String(legendX + 35 + legendSteps * (cellSize * 0.7 + 2) + 4),
		);
		moreLabel.setAttribute('y', String(legendY + 10));
		moreLabel.setAttribute('fill', 'var(--sl-color-gray-4, #6b7280)');
		moreLabel.setAttribute('font-size', String(fontSize));
		moreLabel.textContent = 'More';
		svg.appendChild(moreLabel);

		// Total count
		const totalItems = Object.values(dateCounts).reduce((s, v) => s + v, 0);
		const totalDays = Object.keys(dateCounts).length;
		const totalText = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'text',
		);
		totalText.setAttribute('x', String(marginLeft));
		totalText.setAttribute('y', String(legendY + 10));
		totalText.setAttribute('fill', 'var(--sl-color-gray-3, #8b949e)');
		totalText.setAttribute('font-size', String(fontSize));
		totalText.textContent = `${totalItems} items across ${totalDays} days`;
		svg.appendChild(totalText);

		container.appendChild(svg);
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
					fontSize: '0.85rem',
					fontWeight: 600,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					color: 'var(--sl-color-gray-3, #8b949e)',
				}}>
				Activity Heatmap
			</h3>
			<div ref={containerRef} style={{ width: '100%', maxWidth: 1100 }} />
		</div>
	);
}
