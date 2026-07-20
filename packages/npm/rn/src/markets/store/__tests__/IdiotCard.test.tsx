import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { IdiotCard } from '../IdiotCard.tsx';

describe('IdiotCard native fallback', () => {
	it('shows the collectible; locks when not revealed', () => {
		const locked = render(<IdiotCard revealed={false} />);
		expect(locked.getByText('IDIOT')).toBeTruthy();
		expect(locked.getByText('🔒')).toBeTruthy();
		cleanup();
		const open = render(<IdiotCard revealed={true} />);
		expect(open.queryByText('🔒')).toBeNull();
	});
});
