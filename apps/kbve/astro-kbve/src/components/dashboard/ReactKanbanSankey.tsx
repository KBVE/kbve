import { useEffect, useRef } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_COLORS,
	COLUMN_ORDER,
} from './useKanbanSection';

interface Props {
	sectionIndex: number;
}

export default function ReactKanbanSankey({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();
	const svgRef = useRef<SVGSVGElement>(null);
	const rendered = useRef(false);

	useEffect(() => {
		if (!active || !data || rendered.current || !svgRef.current) return;
		rendered.current = true;

		const summary = data.summary;
		const width = 900;
		const height = 420;

		// Group columns into phases (prefixed to avoid name collisions like Done→Done)
		const phaseMap: Record<string, string> = {
			Theory: 'phase:Planning',
			AI: 'phase:Planning',
			Backlog: 'phase:Planning',
			Todo: 'phase:Active',
			Staging: 'phase:Active',
			Review: 'phase:Active',
			Error: 'phase:Blocked',
			Support: 'phase:Blocked',
			Done: 'phase:Done',
		};

		const phases = [
			'phase:Planning',
			'phase:Active',
			'phase:Blocked',
			'phase:Done',
		];
		const phaseDisplayName: Record<string, string> = {
			'phase:Planning': 'Planning',
			'phase:Active': 'Active',
			'phase:Blocked': 'Blocked',
			'phase:Done': 'Done',
		};

		// Only include columns that have items
		const activeColumns = COLUMN_ORDER.filter(
			(col) => (summary[col] ?? 0) > 0,
		);

		// Only include phases that have at least one contributing column
		const activePhases = phases.filter((phase) =>
			activeColumns.some((col) => phaseMap[col] === phase),
		);

		// Build node list: column names + prefixed phase names (guaranteed unique)
		const nodeList = [...activeColumns, ...activePhases];
		const nodeIndex = new Map(nodeList.map((n, i) => [n, i]));

		const links: Array<{ source: number; target: number; value: number }> =
			[];

		for (const col of activeColumns) {
			const count = summary[col] ?? 0;
			const phase = phaseMap[col];
			links.push({
				source: nodeIndex.get(col)!,
				target: nodeIndex.get(phase)!,
				value: count,
			});
		}

		if (links.length === 0) return;

		const sankeyGen = sankey<any, any>()
			.nodeId((d: any) => d.index)
			.nodeAlign(sankeyLeft)
			.nodeWidth(16)
			.nodePadding(14)
			.extent([
				[16, 16],
				[width - 16, height - 16],
			]);

		const graph = sankeyGen({
			nodes: nodeList.map((name, i) => ({ name, index: i })),
			links: links.map((l) => ({ ...l })),
		});

		const svg = svgRef.current;
		while (svg.firstChild) svg.removeChild(svg.firstChild);

		// Links
		const linkGroup = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'g',
		);
		linkGroup.setAttribute('fill', 'none');
		svg.appendChild(linkGroup);

		const pathGen = sankeyLinkHorizontal();

		for (let i = 0; i < graph.links.length; i++) {
			const link = graph.links[i] as any;
			const path = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'path',
			);
			path.setAttribute('d', pathGen(link) ?? '');
			path.setAttribute(
				'stroke',
				COLUMN_COLORS[(link.source as any).name] ?? '#6b7280',
			);
			path.setAttribute(
				'stroke-width',
				String(Math.max(link.width ?? 1, 1)),
			);
			path.setAttribute('stroke-opacity', '0.35');
			path.style.opacity = '0';
			path.style.transition = `opacity 0.4s ease ${(i * 0.05).toFixed(2)}s`;

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			const srcName =
				phaseDisplayName[(link.source as any).name] ??
				(link.source as any).name;
			const tgtName =
				phaseDisplayName[(link.target as any).name] ??
				(link.target as any).name;
			title.textContent = `${srcName} → ${tgtName}: ${link.value}`;
			path.appendChild(title);
			linkGroup.appendChild(path);

			requestAnimationFrame(() => {
				path.style.opacity = '1';
			});
		}

		// Nodes
		const phaseColor: Record<string, string> = {
			'phase:Planning': '#8b5cf6',
			'phase:Active': '#3b82f6',
			'phase:Blocked': '#ef4444',
			'phase:Done': '#22c55e',
		};

		for (const node of graph.nodes as any[]) {
			const isPhase = activePhases.includes(node.name);
			const displayName = isPhase
				? (phaseDisplayName[node.name] ?? node.name)
				: node.name;
			const color = isPhase
				? (phaseColor[node.name] ?? '#6b7280')
				: (COLUMN_COLORS[node.name] ?? '#6b7280');

			const rect = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			rect.setAttribute('x', String(node.x0));
			rect.setAttribute('y', String(node.y0));
			rect.setAttribute('width', String(node.x1 - node.x0));
			rect.setAttribute('height', String(Math.max(node.y1 - node.y0, 1)));
			rect.setAttribute('rx', '3');
			rect.setAttribute('fill', color);
			rect.setAttribute('opacity', isPhase ? '0.9' : '0.7');

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `${displayName}: ${node.value ?? 0}`;
			rect.appendChild(title);
			svg.appendChild(rect);

			// Label
			const h = node.y1 - node.y0;
			if (h > 12) {
				const text = document.createElementNS(
					'http://www.w3.org/2000/svg',
					'text',
				);
				const isLeft = node.x0 < width / 2;
				text.setAttribute(
					'x',
					String(isLeft ? node.x1 + 6 : node.x0 - 6),
				);
				text.setAttribute('y', String((node.y0 + node.y1) / 2 + 4));
				text.setAttribute('text-anchor', isLeft ? 'start' : 'end');
				text.setAttribute('fill', 'var(--sl-color-gray-3, #8b949e)');
				text.setAttribute('font-size', isPhase ? '13' : '11');
				text.setAttribute('font-weight', isPhase ? '700' : '500');
				text.textContent = `${displayName} (${node.value ?? 0})`;
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
				Pipeline Flow
			</h3>
			<svg
				ref={svgRef}
				width={900}
				height={420}
				viewBox="0 0 900 420"
				style={{ maxWidth: '100%', height: 'auto' }}
			/>
		</div>
	);
}
