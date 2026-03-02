import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup } from '@testing-library/react';
import { PhaserContext, type PhaserGameRef } from './use-phaser';
import { usePhaserEvent } from './use-phaser-event';

function createMockGame() {
	const gameEvents = { on: vi.fn(), off: vi.fn() };
	const sceneEvents = { on: vi.fn(), off: vi.fn() };
	const mockScene = { events: sceneEvents };
	const game = {
		events: gameEvents,
		scene: {
			getScene: vi.fn((name: string) =>
				name === 'TestScene' ? mockScene : null,
			),
		},
	} as unknown as import('phaser').Game;
	return { game, gameEvents, sceneEvents };
}

function makeWrapper(ref: PhaserGameRef) {
	return ({ children }: { children: React.ReactNode }) => (
		<PhaserContext.Provider value={ref}>{children}</PhaserContext.Provider>
	);
}

beforeEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('usePhaserEvent', () => {
	it('should attach a game-level event listener', () => {
		const { game, gameEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler = vi.fn();

		renderHook(() => usePhaserEvent('test-event', handler), {
			wrapper: makeWrapper(ref),
		});

		expect(gameEvents.on).toHaveBeenCalledWith(
			'test-event',
			expect.any(Function),
		);
	});

	it('should remove the game-level listener on unmount', () => {
		const { game, gameEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler = vi.fn();

		const { unmount } = renderHook(
			() => usePhaserEvent('test-event', handler),
			{ wrapper: makeWrapper(ref) },
		);
		unmount();

		expect(gameEvents.off).toHaveBeenCalledWith(
			'test-event',
			expect.any(Function),
		);
	});

	it('should attach a scene-level event listener when sceneName is given', () => {
		const { game, sceneEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler = vi.fn();

		renderHook(() => usePhaserEvent('scene-event', handler, 'TestScene'), {
			wrapper: makeWrapper(ref),
		});

		expect(sceneEvents.on).toHaveBeenCalledWith(
			'scene-event',
			expect.any(Function),
		);
	});

	it('should remove the scene-level listener on unmount', () => {
		const { game, sceneEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler = vi.fn();

		const { unmount } = renderHook(
			() => usePhaserEvent('scene-event', handler, 'TestScene'),
			{ wrapper: makeWrapper(ref) },
		);
		unmount();

		expect(sceneEvents.off).toHaveBeenCalledWith(
			'scene-event',
			expect.any(Function),
		);
	});

	it('should not attach listener when scene is not found', () => {
		const { game, gameEvents, sceneEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler = vi.fn();

		renderHook(() => usePhaserEvent('event', handler, 'NonExistentScene'), {
			wrapper: makeWrapper(ref),
		});

		expect(sceneEvents.on).not.toHaveBeenCalled();
		expect(gameEvents.on).not.toHaveBeenCalled();
	});

	it('should not attach listener when game is null', () => {
		const ref: PhaserGameRef = { game: null, status: 'idle' };
		const handler = vi.fn();

		// Should not throw
		renderHook(() => usePhaserEvent('event', handler), {
			wrapper: makeWrapper(ref),
		});
	});

	it('should call the latest handler via ref', () => {
		const { game, gameEvents } = createMockGame();
		const ref: PhaserGameRef = { game, status: 'running' };
		const handler1 = vi.fn();
		const handler2 = vi.fn();

		const { rerender } = renderHook(
			({ handler }) => usePhaserEvent('test', handler),
			{
				wrapper: makeWrapper(ref),
				initialProps: { handler: handler1 },
			},
		);

		// Grab the callback that was registered
		const registeredCallback = gameEvents.on.mock.calls[0][1];

		// Rerender with a new handler
		rerender({ handler: handler2 });

		// The registered callback should forward to the latest handler
		registeredCallback('arg1', 'arg2');
		expect(handler1).not.toHaveBeenCalled();
		expect(handler2).toHaveBeenCalledWith('arg1', 'arg2');
	});
});
