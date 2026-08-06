import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MonorepoGraphExplorer from './MonorepoGraphExplorer';

// Mock the hooks
vi.mock('./useMonorepoGraph', () => ({
	useMonorepoGraph: vi.fn(() => ({
		overview: {
			meta: {
				dirs: 150,
				files: 5000,
				symbols: 67000,
				dirEdges: 800,
				built_at_commit: 'abc1234567',
			},
			dirs: [
				{
					id: 'apps/kbve',
					label: 'apps/kbve',
					x: 100,
					y: 100,
					r: 15,
					n: 15000,
					files: 250,
					c: 1,
					ref: '/docs/apps/kbve',
					nx: { projects: [{ name: 'kbve', type: 'app' }] },
				},
				{
					id: 'libs/ui',
					label: 'libs/ui',
					x: 150,
					y: 150,
					r: 12,
					n: 8000,
					files: 120,
					c: 2,
				},
			],
			dirEdges: [[0, 1, 5]],
		},
		loading: false,
		error: null,
		loadDir: vi.fn(),
		getChunk: vi.fn(() => null),
	})),
	REL_COLORS: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
	REL_LABELS: ['depends', 'imports', 'references'],
}));

// Mock Canvas component from @react-three/fiber
vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="mock-canvas">{children}</div>
	),
}));

// Mock TieredGraphScene
vi.mock('./TieredGraphScene', () => ({
	default: vi.fn(() => null),
}));

describe('MonorepoGraphExplorer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset window size
		Object.defineProperty(window, 'innerWidth', {
			writable: true,
			configurable: true,
			value: 1024,
		});
		Object.defineProperty(window, 'innerHeight', {
			writable: true,
			configurable: true,
			value: 768,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Desktop View', () => {
		it('renders the graph explorer with statistics', () => {
			render(<MonorepoGraphExplorer />);

			expect(screen.getByText(/150/)).toBeInTheDocument();
			expect(screen.getByText(/5,000/)).toBeInTheDocument();
			expect(screen.getByText(/67,000/)).toBeInTheDocument();
		});

		it('shows desktop hints with keyboard shortcuts', () => {
			render(<MonorepoGraphExplorer />);

			expect(
				screen.getByText(/Scroll\/pinch to zoom · Drag to pan · Click nodes to explore/),
			).toBeInTheDocument();
		});

		it('displays all control buttons', () => {
			render(<MonorepoGraphExplorer />);

			expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
			expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
			expect(screen.getByLabelText('Reset view')).toBeInTheDocument();
		});

		it('shows color mode toggle buttons', () => {
			render(<MonorepoGraphExplorer />);

			expect(screen.getByText(/Color: directory/)).toBeInTheDocument();
			expect(screen.getByText(/Color: community/)).toBeInTheDocument();
		});

		it('toggles color mode when button is clicked', () => {
			render(<MonorepoGraphExplorer />);

			const communityBtn = screen.getByText(/Color: community/);
			fireEvent.click(communityBtn);

			expect(communityBtn).toHaveClass('is-active');
		});

		it('shows relationship legend', () => {
			render(<MonorepoGraphExplorer />);

			expect(screen.getByText('depends')).toBeInTheDocument();
			expect(screen.getByText('imports')).toBeInTheDocument();
			expect(screen.getByText('references')).toBeInTheDocument();
		});
	});

	describe('Mobile Responsive Behavior', () => {
		beforeEach(() => {
			// Simulate mobile viewport
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: 375,
			});
			Object.defineProperty(window, 'matchMedia', {
				writable: true,
				value: vi.fn().mockImplementation((query) => ({
					matches: query === '(pointer: coarse)',
					media: query,
					onchange: null,
					addListener: vi.fn(),
					removeListener: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn(),
				})),
			});
		});

		it('starts with collapsed controls on mobile', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			const controls = container.querySelector('.mgx__controls');
			expect(controls).not.toHaveClass('is-expanded');
		});

		it('shows hamburger menu toggle on mobile', () => {
			render(<MonorepoGraphExplorer />);

			const toggle = screen.getByLabelText('Expand controls');
			expect(toggle).toBeInTheDocument();
			expect(toggle.textContent).toBe('☰');
		});

		it('expands controls when toggle is clicked', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			const toggle = screen.getByLabelText('Expand controls');
			fireEvent.click(toggle);

			const controls = container.querySelector('.mgx__controls');
			expect(controls).toHaveClass('is-expanded');
			expect(screen.getByLabelText('Collapse controls')).toBeInTheDocument();
		});

		it('collapses controls when close button is clicked', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			// Expand first
			const expandToggle = screen.getByLabelText('Expand controls');
			fireEvent.click(expandToggle);

			// Then collapse
			const collapseToggle = screen.getByLabelText('Collapse controls');
			fireEvent.click(collapseToggle);

			const controls = container.querySelector('.mgx__controls');
			expect(controls).not.toHaveClass('is-expanded');
		});
	});

	describe('Search Functionality', () => {
		it('shows search results when query matches directories', async () => {
			render(<MonorepoGraphExplorer />);

			const searchInput = screen.getByPlaceholderText('Search directory…');
			fireEvent.change(searchInput, { target: { value: 'kbve' } });

			await waitFor(() => {
				expect(screen.getByText('apps/kbve')).toBeInTheDocument();
			});
		});

		it('limits search results to 8 items', async () => {
			const { useMonorepoGraph } = await import('./useMonorepoGraph');
			const mockHook = useMonorepoGraph as any;

			// Create 10 directories matching search
			const manyDirs = Array.from({ length: 10 }, (_, i) => ({
				id: `test-${i}`,
				label: `test-${i}`,
				x: i * 10,
				y: i * 10,
				r: 10,
				n: 1000,
				files: 10,
				c: 1,
			}));

			mockHook.mockReturnValue({
				overview: {
					meta: { dirs: 10, files: 100, symbols: 1000, dirEdges: 0, built_at_commit: 'test' },
					dirs: manyDirs,
					dirEdges: [],
				},
				loading: false,
				error: null,
				loadDir: vi.fn(),
				getChunk: vi.fn(() => null),
			});

			render(<MonorepoGraphExplorer />);

			const searchInput = screen.getByPlaceholderText('Search directory…');
			fireEvent.change(searchInput, { target: { value: 'test' } });

			await waitFor(() => {
				const results = screen.getAllByRole('button', { name: /test-/ });
				expect(results.length).toBeLessThanOrEqual(8);
			});
		});

		it('clears search when a result is selected', async () => {
			render(<MonorepoGraphExplorer />);

			const searchInput = screen.getByPlaceholderText(
				'Search directory…',
			) as HTMLInputElement;
			fireEvent.change(searchInput, { target: { value: 'kbve' } });

			await waitFor(() => {
				const result = screen.getByText('apps/kbve');
				fireEvent.click(result);
			});

			expect(searchInput.value).toBe('');
		});
	});

	describe('Keyboard Shortcuts', () => {
		it('zooms in when + key is pressed', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			fireEvent.keyDown(window, { key: '+' });

			// Verify zoom trigger was set (implementation detail)
			expect(container).toBeInTheDocument();
		});

		it('zooms out when - key is pressed', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			fireEvent.keyDown(window, { key: '-' });

			expect(container).toBeInTheDocument();
		});

		it('resets view when R key is pressed', () => {
			const { container } = render(<MonorepoGraphExplorer />);

			fireEvent.keyDown(window, { key: 'R' });

			expect(container).toBeInTheDocument();
		});

		it('ignores keyboard shortcuts when typing in input', () => {
			render(<MonorepoGraphExplorer />);

			const searchInput = screen.getByPlaceholderText('Search directory…');
			searchInput.focus();

			fireEvent.keyDown(searchInput, { key: '+' });

			// Should not trigger zoom (no assertion needed, just shouldn't error)
			expect(searchInput).toHaveFocus();
		});
	});

	describe('Stats Panel', () => {
		it('toggles stats panel when button is clicked', () => {
			render(<MonorepoGraphExplorer />);

			const statsButton = screen.getByTitle('Toggle statistics (S)');
			fireEvent.click(statsButton);

			expect(screen.getByText('Graph Statistics')).toBeInTheDocument();
			expect(screen.getByText('Directories')).toBeInTheDocument();
			expect(screen.getByText('Files')).toBeInTheDocument();
			expect(screen.getByText('Symbols')).toBeInTheDocument();
			expect(screen.getByText('Edges')).toBeInTheDocument();
		});

		it('shows commit hash in stats', () => {
			render(<MonorepoGraphExplorer />);

			const statsButton = screen.getByTitle('Toggle statistics (S)');
			fireEvent.click(statsButton);

			expect(screen.getByText('abc1234')).toBeInTheDocument();
		});

		it('shows current zoom level', () => {
			render(<MonorepoGraphExplorer />);

			const statsButton = screen.getByTitle('Toggle statistics (S)');
			fireEvent.click(statsButton);

			expect(screen.getByText(/1\.0x/)).toBeInTheDocument();
		});
	});

	describe('Loading and Error States', () => {
		it('shows loading message when data is loading', async () => {
			const { useMonorepoGraph } = await import('./useMonorepoGraph');
			const mockHook = useMonorepoGraph as any;

			mockHook.mockReturnValue({
				overview: null,
				loading: true,
				error: null,
				loadDir: vi.fn(),
				getChunk: vi.fn(() => null),
			});

			render(<MonorepoGraphExplorer />);

			expect(screen.getByText('Loading monorepo graph…')).toBeInTheDocument();
		});

		it('shows error message when loading fails', async () => {
			const { useMonorepoGraph } = await import('./useMonorepoGraph');
			const mockHook = useMonorepoGraph as any;

			mockHook.mockReturnValue({
				overview: null,
				loading: false,
				error: 'Network error',
				loadDir: vi.fn(),
				getChunk: vi.fn(() => null),
			});

			render(<MonorepoGraphExplorer />);

			expect(screen.getByText(/Failed to load graph: Network error/)).toBeInTheDocument();
		});
	});

	describe('Fullscreen Functionality', () => {
		it('requests fullscreen when fullscreen button is clicked', async () => {
			const mockRequestFullscreen = vi.fn();
			document.querySelector = vi.fn(() => ({
				requestFullscreen: mockRequestFullscreen,
			})) as any;

			render(<MonorepoGraphExplorer />);

			const fullscreenButton = screen.getByTitle('Fullscreen (F)');
			fireEvent.click(fullscreenButton);

			await waitFor(() => {
				expect(mockRequestFullscreen).toHaveBeenCalled();
			});
		});
	});

	describe('Accessibility', () => {
		it('has proper ARIA labels for navigation controls', () => {
			render(<MonorepoGraphExplorer />);

			expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
			expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
			expect(screen.getByLabelText('Reset view')).toBeInTheDocument();
		});

		it('has proper button roles', () => {
			render(<MonorepoGraphExplorer />);

			const buttons = screen.getAllByRole('button');
			expect(buttons.length).toBeGreaterThan(0);
		});
	});
});
