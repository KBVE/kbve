import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ProductCard } from '../ProductCard';
import type { StoreProduct } from '../types';

const digital: StoreProduct = {
	product_id: 'p1', slug: 'coin', title: 'Coin', description: 'shiny',
	price: 50, currency: 'credits', fulfillment: 'digital', asset_ref: {},
	variant_count: 0, created_at: '',
};

describe('ProductCard', () => {
	it('shows Owned badge and no buy button when owned', () => {
		const { getByText, queryByText } = render(
			<ProductCard product={digital} owned authenticated busy={false}
				onBuyDigital={vi.fn()} onBuyPhysical={vi.fn()} />,
		);
		expect(getByText('Owned')).toBeTruthy();
		expect(queryByText(/Buy/)).toBeNull();
	});

	it('fires onBuyDigital for a digital product when authenticated', () => {
		const onBuyDigital = vi.fn();
		const { getByText } = render(
			<ProductCard product={digital} owned={false} authenticated busy={false}
				onBuyDigital={onBuyDigital} onBuyPhysical={vi.fn()} />,
		);
		fireEvent.click(getByText(/Buy/));
		expect(onBuyDigital).toHaveBeenCalledWith('coin');
	});

	it('treats a missing fulfillment as digital, not physical', () => {
		const onBuyDigital = vi.fn();
		const onBuyPhysical = vi.fn();
		const legacy = { ...digital } as StoreProduct;
		delete (legacy as Partial<StoreProduct>).fulfillment;
		const { getByText } = render(
			<ProductCard product={legacy} owned={false} authenticated busy={false}
				onBuyDigital={onBuyDigital} onBuyPhysical={onBuyPhysical} />,
		);
		fireEvent.click(getByText(/Buy/));
		expect(onBuyPhysical).not.toHaveBeenCalled();
		expect(onBuyDigital).toHaveBeenCalledWith('coin');
	});

	it('routes physical and both to the shipping checkout', () => {
		for (const fulfillment of ['physical', 'both'] as const) {
			const onBuyPhysical = vi.fn();
			const { getByText, unmount } = render(
				<ProductCard product={{ ...digital, fulfillment }} owned={false}
					authenticated busy={false}
					onBuyDigital={vi.fn()} onBuyPhysical={onBuyPhysical} />,
			);
			fireEvent.click(getByText(/Buy/));
			expect(onBuyPhysical).toHaveBeenCalledWith('coin');
			unmount();
		}
	});
});
