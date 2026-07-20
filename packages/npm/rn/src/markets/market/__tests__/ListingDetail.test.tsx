import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetail } from '../ListingDetail';
import type { MarketApi } from '../api';

const DETAIL = {
	listing_id: 7,
	seller_account: 'seller',
	item_ref: { kind: 'generic', id: 'x' },
	currency: 'khash',
	buy_now_price: 1000,
	min_bid: 100,
	current_bid: null,
	current_bid_id: null,
	listing_status: 'active',
	expires_at: new Date(Date.now() + 86400000).toISOString(),
	created_at: '2020',
	updated_at: '2020',
	settled_at: null,
	bids: [],
};

function stubApi(over: Partial<MarketApi> = {}): MarketApi {
	return {
		listActive: vi.fn(),
		listingDetail: vi.fn(async () => DETAIL as any),
		myAccountId: vi.fn(),
		createListing: vi.fn(),
		placeBid: vi.fn(async () => ({ id: 1 })),
		buyNow: vi.fn(async () => ({ id: 2 })),
		cancelListing: vi.fn(async () => undefined),
		...over,
	} as MarketApi;
}

describe('ListingDetail', () => {
	it('renders buy-now for a non-seller authenticated viewer and fires buyNow', async () => {
		const buyNow = vi.fn(async () => ({ id: 2 }));
		const { findByText } = render(
			<ListingDetail
				api={stubApi({ buyNow })}
				listingId={7}
				authenticated
				myAccount="buyer"
				onBack={vi.fn()}
			/>,
		);
		const btn = await findByText(/Buy Now/);
		fireEvent.click(btn);
		await waitFor(() => expect(buyNow).toHaveBeenCalledWith(7));
	});

	it('shows cancel for the seller, not buy-now', async () => {
		const { findByText, queryByText } = render(
			<ListingDetail
				api={stubApi()}
				listingId={7}
				authenticated
				myAccount="seller"
				onBack={vi.fn()}
			/>,
		);
		expect(await findByText(/Cancel Listing/)).toBeTruthy();
		expect(queryByText(/Buy Now/)).toBeNull();
	});

	it('signed-out viewer sees a sign-in affordance, no actions', async () => {
		const { findByText, queryByText } = render(
			<ListingDetail
				api={stubApi()}
				listingId={7}
				authenticated={false}
				myAccount={null}
				onBack={vi.fn()}
			/>,
		);
		expect(await findByText(/Sign in to bid or buy/)).toBeTruthy();
		expect(queryByText(/Buy Now/)).toBeNull();
	});
});
