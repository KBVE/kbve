import {
	apiFetch as baseApiFetch,
	authedApiFetch,
	ApiError,
} from '@/lib/apiFetch';

export type Fulfillment = 'digital' | 'physical' | 'both';

export type StoreProduct = {
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
};

export type StoreVariant = {
	variant_id: string;
	sku: string;
	attributes: Record<string, unknown>;
	price: number;
	stock: number | null;
};

export type StoreProductDetail = {
	product: Omit<StoreProduct, 'fulfillment' | 'variant_count'> & {
		fulfillment?: Fulfillment;
	};
	variants: StoreVariant[];
};

export type StoreEntitlement = {
	item_id: string;
	slug: string;
	product_id: string;
	title: string | null;
	granted_at: string;
};

export type StoreItem = { item_id: string };

export class StoreApiError extends ApiError {}

function asStoreError(e: unknown): StoreApiError {
	if (e instanceof StoreApiError) return e;
	if (e instanceof ApiError)
		return new StoreApiError(e.message, e.status, e.code);
	return new StoreApiError(
		e instanceof Error ? e.message : 'request failed',
		0,
	);
}

export function catalog(): Promise<StoreProduct[]> {
	return baseApiFetch<StoreProduct[]>('/api/v1/store/products').catch((e) => {
		throw asStoreError(e);
	});
}

export function myEntitlements(): Promise<StoreEntitlement[]> {
	return authedApiFetch<StoreEntitlement[]>(
		'/api/v1/store/me/entitlements',
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function buyProduct(
	slug: string,
	body: { idempotency_key: string },
): Promise<StoreItem> {
	return authedApiFetch<StoreItem>(
		`/api/v1/store/products/${encodeURIComponent(slug)}/buy`,
		{ method: 'POST', body: JSON.stringify(body) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function productDetail(slug: string): Promise<StoreProductDetail> {
	return baseApiFetch<StoreProductDetail>(
		`/api/v1/store/products/${encodeURIComponent(slug)}`,
	).catch((e) => {
		throw asStoreError(e);
	});
}

// ---- staff admin ----

export type StaffProductBody = {
	slug: string;
	title: string;
	description?: string | null;
	price: number;
	fulfillment?: Fulfillment;
	asset_ref?: Record<string, unknown>;
	status?: string;
};

export type StaffVariantBody = {
	sku: string;
	attributes?: Record<string, unknown>;
	price: number;
	stock?: number | null;
	status?: string;
};

export function staffUpsertProduct(
	body: StaffProductBody,
): Promise<{ id: string }> {
	return authedApiFetch<{ id: string }>('/api/v1/store/staff/products', {
		method: 'POST',
		body: JSON.stringify(body),
	}).catch((e) => {
		throw asStoreError(e);
	});
}

export function staffSetProductStatus(
	productId: string,
	status: string,
): Promise<void> {
	return authedApiFetch<void>(
		`/api/v1/store/staff/products/${productId}/status`,
		{ method: 'POST', body: JSON.stringify({ status }) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function staffUpsertVariant(
	productId: string,
	body: StaffVariantBody,
): Promise<{ id: string }> {
	return authedApiFetch<{ id: string }>(
		`/api/v1/store/staff/products/${productId}/variants`,
		{ method: 'POST', body: JSON.stringify(body) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function staffSetVariantStatus(
	variantId: string,
	status: string,
): Promise<void> {
	return authedApiFetch<void>(
		`/api/v1/store/staff/variants/${variantId}/status`,
		{ method: 'POST', body: JSON.stringify({ status }) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

// ---- orders (Phase 2) ----

export type OrderStatus =
	| 'paid'
	| 'processing'
	| 'shipped'
	| 'delivered'
	| 'cancelled'
	| 'refunded';

export type StoreOrder = {
	order_id: number;
	product_id: string;
	variant_id: string | null;
	qty: number;
	credits_amount: number;
	status: OrderStatus;
	tracking: Record<string, unknown>;
	created_at: string;
	updated_at: string;
};

export type StoreOrderStaff = StoreOrder & {
	account_id: string;
	shipping_address: Record<string, unknown>;
};

export type ShippingAddress = {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postal: string;
	country: string;
};

export function buyPhysical(
	variantId: string,
	body: {
		qty: number;
		shipping_address: ShippingAddress;
		idempotency_key: string;
	},
): Promise<{ order_id: number }> {
	return authedApiFetch<{ order_id: number }>(
		`/api/v1/store/variants/${variantId}/buy`,
		{ method: 'POST', body: JSON.stringify(body) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function myOrders(): Promise<StoreOrder[]> {
	return authedApiFetch<StoreOrder[]>('/api/v1/store/me/orders').catch((e) => {
		throw asStoreError(e);
	});
}

export function staffListOrders(status?: OrderStatus): Promise<StoreOrderStaff[]> {
	const q = status ? `?status=${status}` : '';
	return authedApiFetch<StoreOrderStaff[]>(
		`/api/v1/store/staff/orders${q}`,
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function staffAdvanceOrder(
	orderId: number,
	body: { to_status: OrderStatus; tracking?: Record<string, unknown>; note?: string },
): Promise<void> {
	return authedApiFetch<void>(
		`/api/v1/store/staff/orders/${orderId}/advance`,
		{ method: 'POST', body: JSON.stringify(body) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

export function staffRefundOrder(
	orderId: number,
	reason?: string,
): Promise<void> {
	return authedApiFetch<void>(
		`/api/v1/store/staff/orders/${orderId}/refund`,
		{ method: 'POST', body: JSON.stringify({ reason }) },
	).catch((e) => {
		throw asStoreError(e);
	});
}

// ---- Stripe credit on-ramp (Phase 3) ----

export type CreditPack = { pack_id: string; credits: number; label: string };

export const CREDIT_PACKS: CreditPack[] = [
	{ pack_id: 'small', credits: 100, label: '100 credits · $1' },
	{ pack_id: 'medium', credits: 550, label: '550 credits · $5' },
	{ pack_id: 'large', credits: 1200, label: '1200 credits · $10' },
];

export function topupCheckout(packId: string): Promise<{ checkout_url: string }> {
	return authedApiFetch<{ checkout_url: string }>(
		'/api/v1/wallet/topup/checkout',
		{ method: 'POST', body: JSON.stringify({ pack_id: packId }) },
	).catch((e) => {
		throw asStoreError(e);
	});
}
