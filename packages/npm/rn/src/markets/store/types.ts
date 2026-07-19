export type Fulfillment = 'digital' | 'physical' | 'both';

export type OrderStatus =
	| 'paid'
	| 'processing'
	| 'shipped'
	| 'delivered'
	| 'cancelled'
	| 'refunded';

export interface StoreProduct {
	product_id: string;
	slug: string;
	title: string;
	description: string | null;
	price: number;
	currency: string;
	fulfillment: Fulfillment;
	asset_ref: Record<string, unknown>;
	variant_count: number;
	created_at: string;
}

export interface StoreVariant {
	variant_id: string;
	sku: string;
	attributes: Record<string, unknown>;
	price: number;
	stock: number | null;
}

export interface StoreProductDetail {
	product: Omit<StoreProduct, 'fulfillment' | 'variant_count'> & {
		fulfillment?: Fulfillment;
	};
	variants: StoreVariant[];
}

export interface StoreEntitlement {
	item_id: string;
	slug: string;
	product_id: string;
	title: string | null;
	granted_at: string;
}

export interface StoreItem {
	item_id: string;
}

export interface StoreOrder {
	order_id: number;
	product_id: string;
	variant_id: string | null;
	qty: number;
	credits_amount: number;
	status: OrderStatus;
	tracking: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface ShippingAddress {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postal_code: string;
	country: string;
}

export interface CreditPack {
	pack_id: string;
	credits: number;
	label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
	{ pack_id: 'small', credits: 100, label: '100 credits · $1' },
	{ pack_id: 'medium', credits: 550, label: '550 credits · $5' },
	{ pack_id: 'large', credits: 1200, label: '1200 credits · $10' },
];

export const FEATURED_SLUG = 'i-am-an-idiot';
