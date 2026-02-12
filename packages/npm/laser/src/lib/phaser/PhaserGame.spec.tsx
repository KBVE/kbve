import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockDestroy, MockGame } = vi.hoisted(() => {
	const mockDestroy = vi.fn();
	const mockEvents = {
		once: vi.fn((event: string, cb: () => void) => {
			if (event === 'ready') setTimeout(cb, 0);
		}),
		on: vi.fn(),
		off: vi.fn(),
	};
	const MockGame = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
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

import { render, cleanup } from '@testing-library/react';
import { PhaserGame } from './PhaserGame';

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
});
