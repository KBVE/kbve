import { StoreApiError } from './errors';
import { newIdempotencyKey } from './keys';
import type {
	OrderStatus,
	ShippingAddress,
	StaffProductBody,
	StaffVariantBody,
	StoreEntitlement,
	StoreItem,
	StoreOrder,
	StoreOrderStaff,
	StoreProduct,
	StoreProductDetail,
} from './types';

export interface StoreApiOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export interface StoreApi {
	catalog(): Promise<StoreProduct[]>;
	productDetail(slug: string): Promise<StoreProductDetail>;
	myEntitlements(): Promise<StoreEntitlement[]>;
	myOrders(): Promise<StoreOrder[]>;
	buyProduct(slug: string): Promise<StoreItem>;
	buyPhysical(
		variantId: string,
		body: { qty: number; shipping_address: ShippingAddress },
	): Promise<{ order_id: number }>;
	topupCheckout(packId: string): Promise<{ checkout_url: string }>;
	staffUpsertProduct(body: StaffProductBody): Promise<{ id: string }>;
	staffSetProductStatus(productId: string, status: string): Promise<void>;
	staffUpsertVariant(productId: string, body: StaffVariantBody): Promise<{ id: string }>;
	staffSetVariantStatus(variantId: string, status: string): Promise<void>;
	staffListOrders(status?: OrderStatus): Promise<StoreOrderStaff[]>;
	staffAdvanceOrder(
		orderId: number,
		body: { to_status: OrderStatus; tracking?: Record<string, unknown>; note?: string },
	): Promise<void>;
	staffRefundOrder(orderId: number, reason?: string): Promise<void>;
	staffSubmitPod(orderId: number): Promise<{ order_id: number; external_id: string }>;
}

interface Req {
	path: string;
	method?: string;
	body?: unknown;
	auth?: boolean;
}

export function createStoreApi(opts: StoreApiOptions): StoreApi {
	const { getToken, baseUrl = '' } = opts;

	async function call<T>({ path, method = 'GET', body, auth = false }: Req): Promise<T> {
		const headers: Record<string, string> = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (auth) {
			const token = await getToken().catch(() => null);
			if (!token) throw new StoreApiError('Not signed in', 401);
			headers.Authorization = `Bearer ${token}`;
		}
		let res: Response;
		try {
			res = await fetch(`${baseUrl}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			});
		} catch (e) {
			throw new StoreApiError(e instanceof Error ? e.message : 'request failed', 0);
		}
		const text = await res.text();
		let json: unknown;
		try {
			json = text ? JSON.parse(text) : undefined;
		} catch {
			json = undefined;
		}
		if (!res.ok) {
			const j = (json ?? {}) as { error?: string; message?: string; detail?: string };
			throw new StoreApiError(
				j.message ?? j.error ?? j.detail ?? (text || `HTTP ${res.status}`),
				res.status,
				j.error,
			);
		}
		return json as T;
	}

	return {
		catalog: () => call<StoreProduct[]>({ path: '/api/v1/store/products' }),
		productDetail: (slug) =>
			call<StoreProductDetail>({
				path: `/api/v1/store/products/${encodeURIComponent(slug)}`,
			}),
		myEntitlements: () =>
			call<StoreEntitlement[]>({ path: '/api/v1/store/me/entitlements', auth: true }),
		myOrders: () => call<StoreOrder[]>({ path: '/api/v1/store/me/orders', auth: true }),
		buyProduct: (slug) =>
			call<StoreItem>({
				path: `/api/v1/store/products/${encodeURIComponent(slug)}/buy`,
				method: 'POST',
				body: { idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		buyPhysical: (variantId, body) =>
			call<{ order_id: number }>({
				path: `/api/v1/store/variants/${encodeURIComponent(variantId)}/buy`,
				method: 'POST',
				body: { ...body, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		topupCheckout: (packId) =>
			call<{ checkout_url: string }>({
				path: '/api/v1/wallet/topup/checkout',
				method: 'POST',
				body: { pack_id: packId },
				auth: true,
			}),
		staffUpsertProduct: (body) =>
			call<{ id: string }>({ path: '/api/v1/store/staff/products', method: 'POST', body, auth: true }),
		staffSetProductStatus: (productId, status) =>
			call<void>({
				path: `/api/v1/store/staff/products/${encodeURIComponent(productId)}/status`,
				method: 'POST',
				body: { status },
				auth: true,
			}),
		staffUpsertVariant: (productId, body) =>
			call<{ id: string }>({
				path: `/api/v1/store/staff/products/${encodeURIComponent(productId)}/variants`,
				method: 'POST',
				body,
				auth: true,
			}),
		staffSetVariantStatus: (variantId, status) =>
			call<void>({
				path: `/api/v1/store/staff/variants/${encodeURIComponent(variantId)}/status`,
				method: 'POST',
				body: { status },
				auth: true,
			}),
		staffListOrders: (status) =>
			call<StoreOrderStaff[]>({
				path: `/api/v1/store/staff/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`,
				auth: true,
			}),
		staffAdvanceOrder: (orderId, body) =>
			call<void>({ path: `/api/v1/store/staff/orders/${orderId}/advance`, method: 'POST', body, auth: true }),
		staffRefundOrder: (orderId, reason) =>
			call<void>({
				path: `/api/v1/store/staff/orders/${orderId}/refund`,
				method: 'POST',
				body: { reason },
				auth: true,
			}),
		staffSubmitPod: (orderId) =>
			call<{ order_id: number; external_id: string }>({
				path: `/api/v1/store/staff/orders/${orderId}/submit-pod`,
				method: 'POST',
				auth: true,
			}),
	};
}
