import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MCItemMarketSidecar } from '../MCItemMarketSidecar';

const ROW = {
	listing_id: 1,
	seller_account: 's',
	item_ref: { kind: 'mc_item', id: 'diamond' },
	currency: 'khash',
	buy_now_price: 500,
	min_bid: null,
	current_bid: null,
	expires_at: new Date(Date.now() + 86400000).toISOString(),
	created_at: '2020',
};

describe('MCItemMarketSidecar', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});
	it('renders matching listing stats + a card', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify([ROW]) });
		const { findByText, findAllByText } = render(<MCItemMarketSidecar itemRef="diamond" />);
		expect(await findByText(/Other live listings/)).toBeTruthy();
		const hits = await findAllByText(/500 KHash/);
		expect(hits.length).toBeGreaterThan(0);
	});
	it('shows empty state when nothing matches', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const { findByText } = render(<MCItemMarketSidecar itemRef="diamond" />);
		expect(await findByText(/No other active listings/)).toBeTruthy();
	});
});
