import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="r3f-canvas" className={className}>
			{children}
		</div>
	),
	useFrame: vi.fn(),
}));

import { render } from '@testing-library/react';
import { Stage } from './components/Stage';

describe('Stage', () => {
	it('should render a Canvas wrapper', () => {
		const { getByTestId } = render(
			<Stage>
				<mesh />
			</Stage>,
		);
		expect(getByTestId('r3f-canvas')).toBeTruthy();
	});

	it('should pass className to Canvas', () => {
		const { getByTestId } = render(
			<Stage className="my-stage">
				<mesh />
			</Stage>,
		);
		expect(getByTestId('r3f-canvas').className).toBe('my-stage');
	});

	it('should render children inside Canvas', () => {
		const { getByTestId } = render(
			<Stage>
				<div data-testid="child" />
			</Stage>,
		);
		const canvas = getByTestId('r3f-canvas');
		expect(canvas.querySelector('[data-testid="child"]')).toBeTruthy();
	});
});
