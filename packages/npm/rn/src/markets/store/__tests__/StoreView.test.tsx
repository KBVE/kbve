import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('../IdiotCard', () => ({
	IdiotCard: () => null,
}));

import { StoreView } from '../StoreView';

const PRODUCTS = [
	{
		product_id: 'p1',
		slug: 'i-am-an-idiot',
		title: 'Idiot',
		description: 'gag',
		price: 100,
		currency: 'credits',
		fulfillment: 'digital',
		asset_ref: {},
		variant_count: 0,
		created_at: '',
	},
	{
		product_id: 'p2',
		slug: 'mug',
		title: 'Mug',
		description: 'cup',
		price: 500,
		currency: 'credits',
		fulfillment: 'physical',
		asset_ref: {},
		variant_count: 1,
		created_at: '',
	},
];

describe('StoreView', () => {
	beforeEach(() => {
		global.fetch = vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			text: async () =>
				url.includes('/products')
					? JSON.stringify(PRODUCTS)
					: url.includes('/entitlements')
						? JSON.stringify([])
						: JSON.stringify([]),
		})) as any;
	});

	it('loads and renders catalog products', async () => {
		const { findByText } = render(
			<StoreView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText('Idiot')).toBeTruthy();
		expect(await findByText('Mug')).toBeTruthy();
	});

	it('renders the Buy credits panel', async () => {
		const { findByText } = render(
			<StoreView
				getToken={async () => null}
				baseUrl=""
				authenticated={false}
			/>,
		);
		expect(await findByText('Buy credits')).toBeTruthy();
	});
});
