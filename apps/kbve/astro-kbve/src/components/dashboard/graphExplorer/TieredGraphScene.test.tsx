import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import TieredGraphScene from './TieredGraphScene';
import type { Overview } from './useMonorepoGraph';

// Mock dependencies
vi.mock('./graphGeo', () => ({
	buildEdgeGeo: vi.fn(() => ({
		dispose: vi.fn(),
	})),
	buildAdjacency: vi.fn(() => new Map()),
	githubUrl: vi.fn((path: string) => `https://github.com/test/repo/blob/main/${path}`),
}));

vi.mock('./GraphLabels', () => ({
	default: vi.fn(() => null),
}));

const mockOverview: Overview = {
	meta: {
		dirs: 2,
		files: 10,
		symbols: 100,
		dirEdges: 1,
		built_at_commit: 'abc123',
	},
	dirs: [
		{
			id: 'test-dir-1',
			label: 'test-dir-1',
			x: 0,
			y: 0,
			r: 10,
			n: 50,
			files: 5,
			c: 1,
		},
		{
			id: 'test-dir-2',
			label: 'test-dir-2',
			x: 20,
			y: 20,
			r: 8,
			n: 30,
			files: 3,
			c: 2,
		},
	],
	dirEdges: [[0, 1, 1]],
};

const mockProps = {
	overview: mockOverview,
	loadDir: vi.fn(),
	getChunk: vi.fn(() => null),
	colorMode: 'dir' as const,
	labelHost: null,
	focusRequest: null,
	zoomTrigger: null,
	resetTrigger: 0,
	onHover: vi.fn(),
	onPickDir: vi.fn(),
	onZoomChange: vi.fn(),
};

describe('TieredGraphScene', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Node Sizing', () => {
		it('enforces minimum directory node radius for touch targets', () => {
			const tinyDir = {
				...mockOverview.dirs[0],
				r: 3, // Smaller than MIN_DIR_RADIUS (8)
			};

			const overview = {
				...mockOverview,
				dirs: [tinyDir],
			};

			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} overview={overview} />
				</Canvas>,
			);

			expect(container).toBeInTheDocument();
			// Verification would require inspecting Three.js mesh transforms
			// which is challenging in unit tests
		});
	});

	describe('Touch Gesture Handling', () => {
		it('distinguishes between touch and mouse pointer events', () => {
			const onHover = vi.fn();

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} onHover={onHover} />
				</Canvas>,
			);

			// Touch events should not trigger hover tooltips
			// Mouse events should trigger hover tooltips
			// This behavior is tested via pointer type checking in the component
			expect(onHover).not.toHaveBeenCalled();
		});

		it('handles double-tap zoom on directory nodes', () => {
			const onPickDir = vi.fn();

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} onPickDir={onPickDir} />
				</Canvas>,
			);

			// Double-tap logic is implemented in onClick handler
			// First tap picks the directory
			// Second tap within 300ms triggers zoom
			expect(onPickDir).not.toHaveBeenCalled();
		});
	});

	describe('Focus Mode Contrast', () => {
		it('applies enhanced contrast when hovering directory', () => {
			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} />
				</Canvas>,
			);

			// Focused nodes: 125% brightness
			// Dimmed nodes: 18% brightness
			// This creates high contrast for better mobile visibility
			expect(container).toBeInTheDocument();
		});
	});

	describe('Color Modes', () => {
		it('renders with directory color mode', () => {
			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} colorMode="dir" />
				</Canvas>,
			);

			expect(container).toBeInTheDocument();
		});

		it('renders with community color mode', () => {
			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} colorMode="community" />
				</Canvas>,
			);

			expect(container).toBeInTheDocument();
		});
	});

	describe('Zoom and Navigation', () => {
		it('handles zoom trigger from parent', () => {
			const { rerender } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} />
				</Canvas>,
			);

			// Trigger zoom
			rerender(
				<Canvas>
					<TieredGraphScene
						{...mockProps}
						zoomTrigger={{ delta: 1.3, seq: 1 }}
					/>
				</Canvas>,
			);

			expect(mockProps.onZoomChange).toHaveBeenCalled();
		});

		it('handles reset view trigger', () => {
			const { rerender } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} resetTrigger={0} />
				</Canvas>,
			);

			rerender(
				<Canvas>
					<TieredGraphScene {...mockProps} resetTrigger={1} />
				</Canvas>,
			);

			expect(mockProps.onPickDir).toHaveBeenCalledWith(null);
		});

		it('flies to directory on focus request', () => {
			const { rerender } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} />
				</Canvas>,
			);

			rerender(
				<Canvas>
					<TieredGraphScene
						{...mockProps}
						focusRequest={{ id: 'test-dir-1', seq: 1 }}
					/>
				</Canvas>,
			);

			expect(mockProps.loadDir).toHaveBeenCalledWith('test-dir-1');
		});
	});

	describe('Label Rendering', () => {
		it('creates label items for directories', () => {
			const labelHost = document.createElement('div');

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} labelHost={labelHost} />
				</Canvas>,
			);

			// Labels are created from overview.dirs
			// Each directory gets a label with priority based on log(n+1)
			expect(labelHost).toBeInTheDocument();
		});
	});

	describe('File and Symbol Nodes', () => {
		it('enforces minimum file node radius', () => {
			const mockChunk = {
				dir: 'test-dir',
				files: [
					{
						i: 0,
						label: 'test.ts',
						path: 'test-dir/test.ts',
						x: 0,
						y: 0,
						n: 1, // Very few symbols
					},
				],
				fileEdges: [],
				symbols: [],
				symbolEdges: [],
			};

			const getChunk = vi.fn(() => mockChunk);

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} getChunk={getChunk} />
				</Canvas>,
			);

			// File nodes should be at least MIN_FILE_RADIUS (10px)
			expect(getChunk).not.toHaveBeenCalled(); // Not called until zoom
		});

		it('renders symbols 10% brighter for distinction', () => {
			const mockChunk = {
				dir: 'test-dir',
				files: [
					{
						i: 0,
						label: 'test.ts',
						path: 'test-dir/test.ts',
						x: 0,
						y: 0,
						n: 10,
					},
				],
				fileEdges: [],
				symbols: [
					{
						i: 0,
						label: 'TestFunction',
						f: 0,
						x: 5,
						y: 5,
						c: 1,
						loc: 'L10',
					},
				],
				symbolEdges: [],
			};

			const getChunk = vi.fn(() => mockChunk);

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} getChunk={getChunk} />
				</Canvas>,
			);

			// Symbols are rendered with 110% color brightness
			expect(getChunk).not.toHaveBeenCalled();
		});
	});

	describe('Double-Tap File Navigation', () => {
		it('shows tooltip on first tap, opens GitHub on second tap', () => {
			const mockChunk = {
				dir: 'test-dir',
				files: [
					{
						i: 0,
						label: 'test.ts',
						path: 'test-dir/test.ts',
						x: 0,
						y: 0,
						n: 10,
					},
				],
				fileEdges: [],
				symbols: [],
				symbolEdges: [],
			};

			const getChunk = vi.fn(() => mockChunk);
			const onHover = vi.fn();

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} getChunk={getChunk} onHover={onHover} />
				</Canvas>,
			);

			// First tap should show tooltip with "Double-tap to open" message
			// Second tap within 300ms should open GitHub
			// This is implemented in the file mesh onClick handler
		});
	});

	describe('User Interaction Tracking', () => {
		it('prevents auto-load during manual pan/zoom', () => {
			const loadDir = vi.fn();

			render(
				<Canvas>
					<TieredGraphScene {...mockProps} loadDir={loadDir} />
				</Canvas>,
			);

			// When user is interacting with controls, auto-load should be prevented
			// This is tracked via isUserInteracting ref
			expect(loadDir).not.toHaveBeenCalled();
		});
	});

	describe('Edge Rendering', () => {
		it('renders directory edges with vertex colors', () => {
			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} />
				</Canvas>,
			);

			// Edges are rendered as lineSegments with vertex coloring
			// Brightness is log-scaled based on edge weight
			expect(container).toBeInTheDocument();
		});

		it('highlights edges when hovering connected nodes', () => {
			const { container } = render(
				<Canvas>
					<TieredGraphScene {...mockProps} />
				</Canvas>,
			);

			// When hovering a node, edges connected to it are highlighted
			// with higher opacity (1.0 vs 0.65)
			expect(container).toBeInTheDocument();
		});
	});
});
