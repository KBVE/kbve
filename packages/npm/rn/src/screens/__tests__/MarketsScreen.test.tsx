import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarketsScreen } from '../MarketsScreen';

vi.mock('../../auth/KbveProvider', () => ({
	useKbve: () => ({ client: { auth: { getSession: async () => ({ data: { session: null } }) } } }),
}));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ signedIn: false }) }));

describe('MarketsScreen', () => {
	it('renders the store/marketplace tab toggle', () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const { getByText } = render(<MarketsScreen />);
		expect(getByText('Store')).toBeTruthy();
		expect(getByText('Marketplace')).toBeTruthy();
	});
});
