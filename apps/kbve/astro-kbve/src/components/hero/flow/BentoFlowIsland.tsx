import { useCallback, useEffect, useRef, useState } from 'react';
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	Handle,
	Position,
	applyNodeChanges,
	type Node,
	type NodeProps,
	type Edge,
	type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const ICONS: Record<string, string> = {
	git: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 6v6m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12-9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 6a9 9 0 0 1-9 9',
	build: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
	test: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
	publish:
		'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7l8.7 5 8.7-5M12 22V12',
	deploy: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
	live: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
};

type PipelineData = {
	label: string;
	meta?: string;
	icon: keyof typeof ICONS;
	accent?: boolean;
	cargo?: string;
};

type PipelineNode = Node<PipelineData, 'pipeline'>;

function PipelineNodeView({ data }: NodeProps<PipelineNode>) {
	return (
		<div
			className="bento-flow-node"
			data-accent={data.accent ? '' : undefined}>
			<Handle
				type="target"
				position={Position.Left}
				style={{ opacity: 0, pointerEvents: 'none' }}
			/>
			<span className="bento-flow-node__icon">
				<svg
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true">
					<path d={ICONS[data.icon]} />
				</svg>
			</span>
			<span className="bento-flow-node__text">
				<span className="bento-flow-node__label">{data.label}</span>
				{data.meta && (
					<span className="bento-flow-node__meta">{data.meta}</span>
				)}
			</span>
			{data.cargo && (
				<span className="bento-flow-node__cargo">{data.cargo}</span>
			)}
			<Handle
				type="source"
				position={Position.Right}
				style={{ opacity: 0, pointerEvents: 'none' }}
			/>
		</div>
	);
}

const nodeTypes = { pipeline: PipelineNodeView };

const PIPELINE_ORDER = ['commit', 'ci', 'tests', 'publish', 'argo', 'live'];

const initialNodes: PipelineNode[] = [
	{
		id: 'commit',
		type: 'pipeline',
		position: { x: 0, y: 120 },
		data: { label: 'git push', meta: 'dev branch', icon: 'git' },
	},
	{
		id: 'ci',
		type: 'pipeline',
		position: { x: 220, y: 30 },
		data: { label: 'Nx build', meta: 'affected only', icon: 'build' },
	},
	{
		id: 'tests',
		type: 'pipeline',
		position: { x: 220, y: 210 },
		data: { label: 'CI checks', meta: 'tests + lint', icon: 'test' },
	},
	{
		id: 'publish',
		type: 'pipeline',
		position: { x: 460, y: 120 },
		data: { label: 'Publish', meta: 'docker + npm', icon: 'publish' },
	},
	{
		id: 'argo',
		type: 'pipeline',
		position: { x: 680, y: 120 },
		data: { label: 'ArgoCD', meta: 'cluster sync', icon: 'deploy' },
	},
	{
		id: 'live',
		type: 'pipeline',
		position: { x: 900, y: 120 },
		data: {
			label: 'kbve.com',
			meta: 'production',
			icon: 'live',
			accent: true,
		},
	},
];

const edgeStyle = {
	stroke: 'color-mix(in srgb, var(--sl-color-accent-high) 55%, transparent)',
	strokeWidth: 1.5,
};

const initialEdges: Edge[] = [
	{
		id: 'e1',
		source: 'commit',
		target: 'ci',
		animated: true,
		style: edgeStyle,
	},
	{
		id: 'e2',
		source: 'commit',
		target: 'tests',
		animated: true,
		style: edgeStyle,
	},
	{
		id: 'e3',
		source: 'ci',
		target: 'publish',
		animated: true,
		style: edgeStyle,
	},
	{
		id: 'e4',
		source: 'tests',
		target: 'publish',
		animated: true,
		style: edgeStyle,
	},
	{
		id: 'e5',
		source: 'publish',
		target: 'argo',
		animated: true,
		style: edgeStyle,
	},
	{
		id: 'e6',
		source: 'argo',
		target: 'live',
		animated: true,
		style: edgeStyle,
	},
];

const PULSE_STEPS: string[][] = [
	['commit'],
	['ci', 'tests'],
	['publish'],
	['argo'],
	['live'],
	[],
];

export default function BentoFlowIsland() {
	const [nodes, setNodes] = useState(initialNodes);
	const [activeIds, setActiveIds] = useState<string[]>([]);
	const [cargo, setCargo] = useState<string | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);

	const onNodesChange = useCallback(
		(changes: NodeChange<PipelineNode>[]) =>
			setNodes((nds) => applyNodeChanges(changes, nds)),
		[],
	);

	useEffect(() => {
		const reduced = window.matchMedia(
			'(prefers-reduced-motion: reduce)',
		).matches;
		if (reduced) return;

		let visible = true;
		let step = -1;
		const pending: string[] = [];
		let lastRun = performance.now();

		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
		});
		if (wrapRef.current) io.observe(wrapRef.current);

		const onArrived = (e: Event) => {
			const { word } = (e as CustomEvent).detail ?? {};
			if (pending.length < 3) pending.push(word ?? 'build');
		};
		window.addEventListener('bento:word-arrived', onArrived);

		const id = setInterval(() => {
			if (!visible) return;
			if (step === -1) {
				const idleFor = performance.now() - lastRun;
				if (pending.length > 0) {
					setCargo(pending.shift() ?? null);
					step = 0;
				} else if (idleFor > 12_000) {
					setCargo(null);
					step = 0;
				} else {
					return;
				}
			}
			setActiveIds(PULSE_STEPS[step]);
			step++;
			if (step >= PULSE_STEPS.length) {
				step = -1;
				lastRun = performance.now();
				setCargo(null);
			}
		}, 900);

		return () => {
			clearInterval(id);
			io.disconnect();
			window.removeEventListener('bento:word-arrived', onArrived);
		};
	}, []);

	const renderedNodes = nodes.map((n) => {
		const active = activeIds.includes(n.id);
		return {
			...n,
			className: active ? 'bento-flow-node--active' : '',
			data:
				active && cargo
					? { ...n.data, cargo }
					: { ...n.data, cargo: undefined },
		};
	});

	return (
		<div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
			{cargo && (
				<div className="bento-flow__ticker">
					shipping <strong>{cargo}</strong>
				</div>
			)}
			<ReactFlow
				nodes={renderedNodes}
				edges={initialEdges}
				nodeTypes={nodeTypes}
				onNodesChange={onNodesChange}
				fitView
				fitViewOptions={{ padding: 0.15 }}
				nodesConnectable={false}
				zoomOnScroll={false}
				panOnScroll={false}
				zoomOnDoubleClick={false}
				preventScrolling={false}
				proOptions={{ hideAttribution: true }}
				style={{ backgroundColor: 'transparent' }}>
				<Background
					variant={BackgroundVariant.Dots}
					gap={22}
					size={1}
					color="color-mix(in srgb, var(--sl-color-white) 12%, transparent)"
				/>
			</ReactFlow>
		</div>
	);
}
