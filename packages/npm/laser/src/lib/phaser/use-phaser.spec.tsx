import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { PhaserContext, usePhaserGame, type PhaserGameRef } from './use-phaser';

describe('usePhaserGame', () => {
	it('should throw when used outside PhaserContext', () => {
		expect(() => renderHook(() => usePhaserGame())).toThrow(
			'usePhaserGame must be used within a <PhaserGame> component',
		);
	});

	it('should return context value when inside provider', () => {
		const ref: PhaserGameRef = { game: null, status: 'idle' };
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<PhaserContext.Provider value={ref}>
				{children}
			</PhaserContext.Provider>
		);

		const { result } = renderHook(() => usePhaserGame(), { wrapper });
		expect(result.current).toBe(ref);
		expect(result.current.status).toBe('idle');
		expect(result.current.game).toBeNull();
	});

	it('should reflect running status with a game instance', () => {
		const fakeGame = { events: {} } as unknown as import('phaser').Game;
		const ref: PhaserGameRef = { game: fakeGame, status: 'running' };
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<PhaserContext.Provider value={ref}>
				{children}
			</PhaserContext.Provider>
		);

		const { result } = renderHook(() => usePhaserGame(), { wrapper });
		expect(result.current.status).toBe('running');
		expect(result.current.game).toBe(fakeGame);
	});
});
