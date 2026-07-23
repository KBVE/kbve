import { useMemo } from 'react';

interface Props {
	center: string;
	deps: string[];
	dependents: string[];
	onSelect?: (name: string) => void;
}

interface Placed {
	name: string;
	x: number;
	y: number;
	role: 'dep' | 'dependent';
}

const W = 640;
const H = 360;
const CX = W / 2;
const CY = H / 2;
const R = 132;
const MAX_PER_SIDE = 12;

/** Neighbors on a semicircle — deps sweep the left arc, dependents the right,
 *  spread deterministically by index so the layout never jitters. */
function place(names: string[], role: Placed['role'], base: number): Placed[] {
	const shown = names.slice(0, MAX_PER_SIDE);
	const span = Math.PI * 0.8;
	const start = base - span / 2;
	const step = shown.length > 1 ? span / (shown.length - 1) : 0;
	return shown.map((name, i) => {
		const a = shown.length === 1 ? base : start + step * i;
		return {
			name,
			role,
			x: CX + Math.cos(a) * R,
			y: CY + Math.sin(a) * R,
		};
	});
}

/**
 * Static dependency-neighborhood graph for one project — its direct NX
 * dependencies (left) and dependents (right), one hop out. Deterministic SVG
 * layout, no physics/runtime deps; nodes are clickable to re-center.
 */
export default function GraphNeighborhood({
	center,
	deps,
	dependents,
	onSelect,
}: Props) {
	const placed = useMemo(
		() => [
			...place(deps, 'dep', Math.PI), // left
			...place(dependents, 'dependent', 0), // right
		],
		[deps, dependents],
	);

	const hiddenDeps = Math.max(0, deps.length - MAX_PER_SIDE);
	const hiddenDependents = Math.max(0, dependents.length - MAX_PER_SIDE);

	return (
		<div className="gnb" data-graph-neighborhood>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`Dependency neighborhood of ${center}`}>
				{placed.map((p) => (
					<line
						key={`e-${p.name}`}
						x1={CX}
						y1={CY}
						x2={p.x}
						y2={p.y}
						className={`gnb__edge gnb__edge--${p.role}`}
					/>
				))}
				{placed.map((p) => (
					<g
						key={`n-${p.name}`}
						className={`gnb__node gnb__node--${p.role}`}
						transform={`translate(${p.x},${p.y})`}
						onClick={() => onSelect?.(p.name)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter') onSelect?.(p.name);
						}}>
						<circle r={5} />
						<text
							x={p.x < CX ? -9 : 9}
							y={4}
							textAnchor={p.x < CX ? 'end' : 'start'}>
							{p.name}
						</text>
					</g>
				))}
				<g
					className="gnb__node gnb__node--center"
					transform={`translate(${CX},${CY})`}>
					<circle r={8} />
					<text y={-14} textAnchor="middle">
						{center}
					</text>
				</g>
			</svg>
			<div className="gnb__legend">
				<span className="gnb__key gnb__key--dep">
					deps {deps.length}
					{hiddenDeps ? ` (+${hiddenDeps})` : ''}
				</span>
				<span className="gnb__key gnb__key--dependent">
					dependents {dependents.length}
					{hiddenDependents ? ` (+${hiddenDependents})` : ''}
				</span>
			</div>
			<style>{`
				.gnb { position: relative; width: 100%; }
				.gnb svg { width: 100%; height: auto; display: block; }
				.gnb__edge { stroke-width: 1; }
				.gnb__edge--dep { stroke: rgba(56,189,248,0.4); }
				.gnb__edge--dependent { stroke: rgba(245,158,11,0.4); }
				.gnb__node { cursor: pointer; }
				.gnb__node text {
					font-size: 11px;
					fill: #cbd5e1;
					paint-order: stroke;
					stroke: rgba(2,6,14,0.85);
					stroke-width: 3px;
				}
				.gnb__node--dep circle { fill: #38bdf8; }
				.gnb__node--dependent circle { fill: #f59e0b; }
				.gnb__node--center circle { fill: #a78bfa; }
				.gnb__node--center text { fill: #e9d5ff; font-weight: 600; font-size: 12px; }
				.gnb__node:hover circle { stroke: #e2e8f0; stroke-width: 2px; }
				.gnb__legend {
					display: flex; gap: 12px; justify-content: center;
					margin-top: 4px; font-size: 0.72rem; color: #94a3b8;
				}
				.gnb__key { display: inline-flex; align-items: center; gap: 4px; }
				.gnb__key--dep::before,
				.gnb__key--dependent::before {
					content: ''; width: 8px; height: 8px; border-radius: 50%;
				}
				.gnb__key--dep::before { background: #38bdf8; }
				.gnb__key--dependent::before { background: #f59e0b; }
			`}</style>
		</div>
	);
}
