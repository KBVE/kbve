import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockDestroy, mockEvents, MockGame } = vi.hoisted(() => {
	const mockDestroy = vi.fn();
	const mockEvents = {
		once: vi.fn((event: string, cb: () => void) => {
			if (event === 'ready') setTimeout(cb, 0);
		}),
		on: vi.fn(),
		off: vi.fn(),
	};
	const MockGame = vi.fn().mockImplementation(function (
		this: Record<string, unknown>,
	) {
		this.events = mockEvents;
		this.scene = { getScene: vi.fn() };
		this.destroy = mockDestroy;
	});
	return { mockDestroy, mockEvents, MockGame };
});

vi.mock('phaser', () => ({
	__esModule: true,
	default: {
		Game: MockGame,
		AUTO: 0,
	},
	Game: MockGame,
	AUTO: 0,
}));

import { render, cleanup, waitFor } from '@testing-library/react';
import { PhaserGame } from './PhaserGame';
import { usePhaserGame } from './use-phaser';

beforeEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('PhaserGame', () => {
	const minimalConfig = {
		scenes: [],
		width: 320,
		height: 240,
	};

	it('should render a container div', () => {
		const { container } = render(<PhaserGame config={minimalConfig} />);
		expect(container.querySelector('div')).toBeTruthy();
	});

	it('should apply className and style', () => {
		const { container } = render(
			<PhaserGame
				config={minimalConfig}
				className="test-class"
				style={{ border: '1px solid red' }}
			/>,
		);
		const div = container.querySelector('div');
		expect(div?.className).toBe('test-class');
		expect(div?.style.border).toBe('1px solid red');
	});

	it('should instantiate Phaser.Game on mount', () => {
		render(<PhaserGame config={minimalConfig} />);
		expect(MockGame).toHaveBeenCalledTimes(1);
	});

	it('should destroy Phaser.Game on unmount', () => {
		const { unmount } = render(<PhaserGame config={minimalConfig} />);
		unmount();
		expect(mockDestroy).toHaveBeenCalledWith(true);
	});

	it('should call onReady when game fires ready event', async () => {
		const onReady = vi.fn();
		render(<PhaserGame config={minimalConfig} onReady={onReady} />);

		// The mock fires 'ready' via setTimeout(cb, 0)
		await waitFor(() => {
			expect(onReady).toHaveBeenCalledTimes(1);
		});
	});

	it('should call onDestroy on unmount', () => {
		const onDestroy = vi.fn();
		const { unmount } = render(
			<PhaserGame config={minimalConfig} onDestroy={onDestroy} />,
		);
		unmount();
		expect(onDestroy).toHaveBeenCalledTimes(1);
	});

	it('should pass config dimensions to Phaser.Game', () => {
		render(
			<PhaserGame config={{ scenes: [], width: 1024, height: 768 }} />,
		);
		expect(MockGame).toHaveBeenCalledWith(
			expect.objectContaining({ width: 1024, height: 768 }),
		);
	});

	it('should default to 800x600 when dimensions are omitted', () => {
		render(<PhaserGame config={{ scenes: [] }} />);
		expect(MockGame).toHaveBeenCalledWith(
			expect.objectContaining({ width: 800, height: 600 }),
		);
	});

	it('should provide PhaserContext to children', () => {
		let contextValue: ReturnType<typeof usePhaserGame> | null = null;

		function ContextReader() {
			contextValue = usePhaserGame();
			return null;
		}

		render(
			<PhaserGame config={minimalConfig}>
				<ContextReader />
			</PhaserGame>,
		);

		expect(contextValue).not.toBeNull();
		expect(contextValue!.status).toBeDefined();
	});

	it('should register the ready event listener', () => {
		render(<PhaserGame config={minimalConfig} />);
		expect(mockEvents.once).toHaveBeenCalledWith(
			'ready',
			expect.any(Function),
		);
	});
});
