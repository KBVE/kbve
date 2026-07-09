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
