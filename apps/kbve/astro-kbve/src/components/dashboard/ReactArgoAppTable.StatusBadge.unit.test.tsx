import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { healthColor, syncColor } from './argoService';
import { StatusBadge } from './ReactArgoAppTable';

const HEALTH_CASES: Array<[string, string]> = [
	['Healthy', '#22c55e'],
	['Degraded', '#ef4444'],
	['Progressing', '#f59e0b'],
	['Suspended', '#6b7280'],
	['Missing', '#ef4444'],
	['Unknown', '#6b7280'],
];

const SYNC_CASES: Array<[string, string]> = [
	['Synced', '#22c55e'],
	['OutOfSync', '#f59e0b'],
	['Unknown', '#6b7280'],
];

function iconStub(status: string) {
	return <span data-testid="icon-stub">{status[0]}</span>;
}

describe('StatusBadge — health colour branches', () => {
	for (const [status, expectedColor] of HEALTH_CASES) {
		it(`renders ${status} with colour ${expectedColor}`, () => {
			render(
				<StatusBadge
					status={status}
					colorFn={healthColor}
					iconFn={iconStub}
				/>,
			);
			const badge = screen.getByText(status).closest('span');
			expect(badge).not.toBeNull();
			expect((badge as HTMLElement).style.color).toBe(
				hexToRgb(expectedColor),
			);
		});
	}
});

describe('StatusBadge — sync colour branches', () => {
	for (const [status, expectedColor] of SYNC_CASES) {
		it(`renders ${status} with colour ${expectedColor}`, () => {
			render(
				<StatusBadge
					status={status}
					colorFn={syncColor}
					iconFn={iconStub}
				/>,
			);
			const badge = screen.getByText(status).closest('span');
			expect(badge).not.toBeNull();
			expect((badge as HTMLElement).style.color).toBe(
				hexToRgb(expectedColor),
			);
		});
	}
});

describe('StatusBadge — icon slot', () => {
	it('renders the icon supplied by iconFn alongside the label', () => {
		render(
			<StatusBadge
				status="Healthy"
				colorFn={healthColor}
				iconFn={iconStub}
			/>,
		);
		expect(screen.getByTestId('icon-stub')).toBeInTheDocument();
		expect(screen.getByText('Healthy')).toBeInTheDocument();
	});
});

// jsdom serializes `style.color = '#ef4444'` as `rgb(239, 68, 68)`,
// so compare against the canonical rgb form rather than the hex literal.
function hexToRgb(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	return `rgb(${r}, ${g}, ${b})`;
}
