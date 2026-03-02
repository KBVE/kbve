import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockUseFrame } = vi.hoisted(() => {
	const mockUseFrame = vi.fn();
	return { mockUseFrame };
});

vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	useFrame: mockUseFrame,
}));

import { renderHook } from '@testing-library/react';
import { useGameLoop } from './hooks/use-game-loop';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('useGameLoop', () => {
	it('should register a frame callback via useFrame', () => {
		const callback = vi.fn();
		renderHook(() => useGameLoop(callback));

		expect(mockUseFrame).toHaveBeenCalledTimes(1);
		expect(mockUseFrame).toHaveBeenCalledWith(expect.any(Function));
	});

	it('should pass delta and elapsed time to the callback', () => {
		const callback = vi.fn();
		renderHook(() => useGameLoop(callback));

		// Grab the callback that was passed to useFrame
		const frameCallback = mockUseFrame.mock.calls[0][0];

		// Simulate a frame
		const mockState = { clock: { elapsedTime: 1.5 } };
		frameCallback(mockState, 0.016);

		expect(callback).toHaveBeenCalledWith(0.016, 1.5);
	});

	it('should always call the latest callback via ref', () => {
		const callback1 = vi.fn();
		const callback2 = vi.fn();

		const { rerender } = renderHook(({ cb }) => useGameLoop(cb), {
			initialProps: { cb: callback1 },
		});

		rerender({ cb: callback2 });

		// useFrame was called during initial render
		const frameCallback = mockUseFrame.mock.calls[0][0];

		const mockState = { clock: { elapsedTime: 2.0 } };
		frameCallback(mockState, 0.033);

		expect(callback1).not.toHaveBeenCalled();
		expect(callback2).toHaveBeenCalledWith(0.033, 2.0);
	});
});
