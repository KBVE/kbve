import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MarketProfileView } from '../MarketProfileView';

beforeEach(() => {
	global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
});

describe('MarketProfileView', () => {
	it('prompts sign-in when unauthenticated', () => {
		const { getByText } = render(
			<MarketProfileView getToken={async () => null} baseUrl="" authenticated={false} />,
		);
		expect(getByText(/Sign in to view your marketplace activity/)).toBeTruthy();
	});

	it('renders the three tabs when authenticated', async () => {
		const { findByText } = render(
			<MarketProfileView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText(/Listings \(/)).toBeTruthy();
		expect(await findByText(/Bids \(/)).toBeTruthy();
		expect(await findByText(/Watching \(/)).toBeTruthy();
	});
});
