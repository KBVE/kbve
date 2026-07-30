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
			<OrdersView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect((await findAllByText('I am an idiot')).length).toBe(2);
		expect(getByText('unlocked')).toBeTruthy();
		expect(getByText('already owned')).toBeTruthy();
	});

	it('does not charge-count a re-buy in credits spent', async () => {
		const { findByText } = render(
			<OrdersView getToken={async () => 'tok'} baseUrl="" authenticated />,
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
			<OrdersView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText('No purchases yet')).toBeTruthy();
	});
});
