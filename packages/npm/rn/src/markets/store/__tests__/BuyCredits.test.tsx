import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { BuyCredits } from '../BuyCredits';
import type { StoreApi } from '../api';

function stubApi(over: Partial<StoreApi> = {}): StoreApi {
	return {
		catalog: vi.fn(),
		productDetail: vi.fn(),
		myEntitlements: vi.fn(),
		myOrders: vi.fn(),
		buyProduct: vi.fn(),
		buyPhysical: vi.fn(),
		topupCheckout: vi.fn(async () => ({ checkout_url: 'https://pay' })),
		...over,
	} as StoreApi;
}

describe('BuyCredits', () => {
	it('renders a button per credit pack', () => {
		const { getByText } = render(<BuyCredits api={stubApi()} authenticated />);
		expect(getByText('100 credits · $1')).toBeTruthy();
		expect(getByText('550 credits · $5')).toBeTruthy();
		expect(getByText('1200 credits · $10')).toBeTruthy();
	});

	it('calls topupCheckout when a pack is pressed while authenticated', async () => {
		const topupCheckout = vi.fn(async () => ({ checkout_url: 'https://pay' }));
		const { getByText } = render(
			<BuyCredits api={stubApi({ topupCheckout })} authenticated />,
		);
		fireEvent.click(getByText('100 credits · $1'));
		await waitFor(() => expect(topupCheckout).toHaveBeenCalledWith('small'));
	});
});
