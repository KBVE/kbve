import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { OrdersView } from '../OrdersView';

const PURCHASES = [
	{
		purchase_id: 1,
		product_id: 'p1',
		slug: 'i-am-an-idiot',
		title: 'I am an idiot',
		item_id: 'i1',
		price: 10,
		currency: 'credits',
		result_kind: 'minted',
		ledger_id: 1532,
		created_at: '2026-07-30T07:25:55.000Z',
	},
	{
		purchase_id: 2,
		product_id: 'p1',
		slug: 'i-am-an-idiot',
		title: 'I am an idiot',
		item_id: 'i1',
		price: 0,
		currency: 'credits',
		result_kind: 'already_owned',
		ledger_id: null,
		created_at: '2026-07-30T07:27:08.000Z',
	},
];

const ORDERS = [
	{
		order_id: 12,
		product_id: 'p2',
		variant_id: 'v1',
		qty: 2,
		product_slug: 'kbve-mug',
		product_title: 'KBVE Mug',
		variant_sku: 'MUG-BLK',
		unit_price: 250,
		currency: 'credits',
		fulfillment: 'physical',
		credits_amount: 500,
		status: 'shipped',
		tracking: { carrier: 'DHL', code: 'ABC123' },
		created_at: '2026-07-28T09:00:00.000Z',
		updated_at: '2026-07-28T12:00:00.000Z',
	},
];

function mockFetch(purchases: unknown[], orders: unknown[]) {
	global.fetch = vi.fn(async (url: string) => ({
		ok: true,
		status: 200,
		text: async () =>
			JSON.stringify(url.includes('/purchases') ? purchases : orders),
	})) as any;
}

describe('OrdersView', () => {
	beforeEach(() => mockFetch(PURCHASES, []));

	it('renders digital receipts when there are no physical orders', async () => {
		const { findAllByText, getByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect((await findAllByText('I am an idiot')).length).toBe(2);
		expect(getByText('unlocked')).toBeTruthy();
		expect(getByText('already owned')).toBeTruthy();
	});

	it('does not charge-count a re-buy in credits spent', async () => {
		const { findByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('10')).toBeTruthy();
	});

	it('prompts anonymous visitors to sign in without calling the API', async () => {
		const { findByText } = render(
			<OrdersView
				getToken={async () => null}
				baseUrl=""
				authenticated={false}
			/>,
		);
		expect(await findByText('Sign in to see your orders')).toBeTruthy();
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('shows an empty state when nothing has been bought', async () => {
		mockFetch([], []);
		const { findByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('No purchases yet')).toBeTruthy();
	});

	it('renders physical orders from their buy-time snapshot, not ids', async () => {
		mockFetch([], ORDERS);
		const { findByText, getByText, queryByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('KBVE Mug')).toBeTruthy();
		expect(getByText('2× MUG-BLK · 500 credits')).toBeTruthy();
		expect(getByText('shipped')).toBeTruthy();
		expect(getByText('Tracking: DHL · ABC123')).toBeTruthy();
		expect(queryByText(/^Order #12$/)).toBeNull();
	});

	it('notes the digital twin on a both-fulfillment order', async () => {
		mockFetch([], [{ ...ORDERS[0], fulfillment: 'both' }]);
		const { findByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(
			await findByText(
				'Ships to you, and the digital copy is already in your inventory.',
			),
		).toBeTruthy();
	});

	it('interleaves digital receipts with physical orders by time', async () => {
		mockFetch(PURCHASES, ORDERS);
		const { findAllByText, getByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect((await findAllByText('I am an idiot')).length).toBe(2);
		expect(getByText('KBVE Mug')).toBeTruthy();
		expect(getByText('3')).toBeTruthy();
		expect(getByText('510')).toBeTruthy();
	});

	it('excludes refunded orders from credits spent', async () => {
		mockFetch([], [{ ...ORDERS[0], status: 'refunded' }]);
		const { findByText } = render(
			<OrdersView
				getToken={async () => 'tok'}
				baseUrl=""
				authenticated
			/>,
		);
		expect(await findByText('refunded')).toBeTruthy();
		expect(await findByText('0')).toBeTruthy();
	});
});
