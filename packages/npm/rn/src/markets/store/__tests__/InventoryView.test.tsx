import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { InventoryView } from '../InventoryView';

const ITEMS = [
	{
		item_id: 'f1dc579d',
		kind: 'store_product',
		ref: 'i-am-an-idiot',
		qty: 1,
		nbt: { title: 'I am an idiot', product_id: 'p1' },
		state: 'held',
		created_at: '2026-07-30T07:25:55.000Z',
	},
	{
		item_id: 'b2c3',
		kind: 'market_pickup',
		ref: 'shiny-coin',
		qty: 3,
		nbt: {},
		state: 'listing_escrow',
		created_at: '2026-07-29T10:00:00.000Z',
	},
];

function mockFetch(items: unknown[]) {
	global.fetch = vi.fn(async () => ({
		ok: true,
		status: 200,
		text: async () => JSON.stringify(items),
	})) as any;
}

describe('InventoryView', () => {
	beforeEach(() => mockFetch(ITEMS));

	it('titles store items from nbt and falls back to ref', async () => {
		const { findByText } = render(
			<InventoryView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('I am an idiot')).toBeTruthy();
		expect(await findByText('shiny-coin')).toBeTruthy();
	});

	it('flags escrowed items as listed', async () => {
		const { findByText } = render(
			<InventoryView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('listed')).toBeTruthy();
		expect(await findByText('held')).toBeTruthy();
		expect(await findByText('listed on the market')).toBeTruthy();
	});

	it('shows an empty state when nothing is owned', async () => {
		mockFetch([]);
		const { findByText } = render(
			<InventoryView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('Nothing owned yet')).toBeTruthy();
	});

	it('prompts anonymous visitors to sign in without calling the API', async () => {
		const { findByText } = render(
			<InventoryView
				getToken={async () => null}
				baseUrl=""
				authenticated={false}
			/>,
		);
		expect(await findByText('Sign in to see your inventory')).toBeTruthy();
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
