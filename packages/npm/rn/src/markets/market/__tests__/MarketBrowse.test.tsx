import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MarketBrowse } from '../MarketBrowse';
import type { MarketApi } from '../api';

const ROWS = [
	{
		listing_id: 1,
		seller_account: 's',
		item_ref: { kind: 'mc_item', id: 'diamond' },
		currency: 'khash',
		buy_now_price: 500,
		min_bid: null,
		current_bid: null,
		expires_at: new Date(Date.now() + 86400000).toISOString(),
		created_at: '2020',
	},
];

function stubApi(over: Partial<MarketApi> = {}): MarketApi {
	return {
		listActive: vi.fn(async () => ROWS as any),
		listingDetail: vi.fn(),
		myAccountId: vi.fn(),
		createListing: vi.fn(),
		placeBid: vi.fn(),
		buyNow: vi.fn(),
		cancelListing: vi.fn(),
		...over,
	} as MarketApi;
}

describe('MarketBrowse', () => {
	beforeEach(() => {});
	it('loads and renders a listing card with its buy-now price', async () => {
		const { findByText } = render(
			<MarketBrowse api={stubApi()} onOpen={vi.fn()} />,
		);
		expect(await findByText(/500 KHash/)).toBeTruthy();
	});
	it('shows empty state when no listings', async () => {
		const { findByText } = render(
			<MarketBrowse
				api={stubApi({ listActive: vi.fn(async () => []) })}
				onOpen={vi.fn()}
			/>,
		);
		expect(await findByText(/No active listings/)).toBeTruthy();
	});
});
