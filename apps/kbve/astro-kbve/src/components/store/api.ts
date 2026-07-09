import {
	apiFetch as baseApiFetch,
	authedApiFetch,
	ApiError,
} from '@/lib/apiFetch';

export type StoreProduct = {
	product_id: string;
	slug: string;
	title: string;
	description: string | null;
	price: number;
	currency: string;
	asset_ref: Record<string, unknown>;
	created_at: string;
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
