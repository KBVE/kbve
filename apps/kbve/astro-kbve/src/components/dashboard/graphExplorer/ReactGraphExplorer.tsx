import { Canvas } from '@react-three/fiber';
import { useGraphLayout } from './useGraphLayout';
import GraphScene from './GraphScene';

interface Props {
	url?: string;
}

/**
 * Interactive dependency-graph explorer. Renders the precomputed Graphify
 * layout on an orthographic Three.js canvas with pan/zoom + level-of-detail:
 * a community overview that expands into member nodes as you zoom in. Sized to
 * fill its container; drop it into a full-height dashboard shell.
 */
export default function ReactGraphExplorer({ url }: Props) {
	const { data, loading, error } = useGraphLayout(url);

	return (
		<div className="graph-explorer" data-graph-explorer>
			{loading && (
				<div className="graph-explorer__msg">Loading graph…</div>
			)}
			{error && (
				<div className="graph-explorer__msg graph-explorer__msg--err">
					Failed to load graph: {error}
				</div>
			)}
			{data && (
				<>
					<Canvas
						orthographic
						camera={{
							position: [0, 0, 100],
							zoom: 1,
							near: 0.1,
							far: 1000,
						}}
						dpr={[1, 2]}
					>
						<color attach="background" args={['#0b0f17']} />
						<GraphScene data={data} />
					</Canvas>
					<div className="graph-explorer__legend">
						<strong>{data.meta.nodes.toLocaleString()}</strong>{' '}
						nodes ·{' '}
						<strong>{data.meta.communities}</strong> communities ·{' '}
						<strong>{data.meta.edges.toLocaleString()}</strong>{' '}
						edges — scroll to zoom, drag to pan
					</div>
				</>
			)}

			<style>{`
				.graph-explorer {
					position: relative;
					width: 100%;
					height: 100%;
					min-height: 480px;
					background: #0b0f17;
					border-radius: 12px;
					overflow: hidden;
				}
				.graph-explorer__msg {
					position: absolute;
					inset: 0;
					display: flex;
					align-items: center;
					justify-content: center;
					color: #94a3b8;
					font-size: 0.9rem;
				}
				.graph-explorer__msg--err { color: #f87171; }
				.graph-explorer__legend {
					position: absolute;
					left: 12px;
					bottom: 12px;
					padding: 6px 10px;
					border-radius: 8px;
					background: rgba(15, 23, 42, 0.7);
					color: #cbd5e1;
					font-size: 0.72rem;
					backdrop-filter: blur(6px);
					pointer-events: none;
				}
				.graph-explorer__legend strong { color: #e2e8f0; }
			`}</style>
		</div>
	);
}
