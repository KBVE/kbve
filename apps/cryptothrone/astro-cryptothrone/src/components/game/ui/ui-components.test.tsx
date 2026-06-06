import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToggleButton } from './ToggleButton';
import { StatsSection } from './StatsSection';
import type { PlayerStats } from '../types';

describe('ToggleButton', () => {
	it('shows a minus when expanded and fires onToggle', () => {
		const onToggle = vi.fn();
		render(
			<ToggleButton
				isCollapsed={false}
				onToggle={onToggle}
				label="Stats"
			/>,
		);
		expect(screen.getByText('-')).toBeInTheDocument();
		screen.getByRole('button').click();
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it('shows a plus when collapsed', () => {
		render(
			<ToggleButton isCollapsed onToggle={() => {}} label="Settings" />,
		);
		expect(screen.getByText('+')).toBeInTheDocument();
		expect(screen.getByText('Settings')).toBeInTheDocument();
	});
});

describe('StatsSection', () => {
	const stats: PlayerStats = {
		hp: 80,
		maxHp: 100,
		mp: 200,
		maxMp: 50,
		ep: 0,
		maxEp: 75,
		username: 'Tester',
	};

	it('renders HP, MP and EP bars and caps the fill at 100%', () => {
		render(<StatsSection stats={stats} />);
		expect(screen.getByText('HP: 80 / 100')).toBeInTheDocument();
		expect(screen.getByText('MP: 200 / 50')).toBeInTheDocument();
		expect(screen.getByText('EP: 0 / 75')).toBeInTheDocument();
	});
});
