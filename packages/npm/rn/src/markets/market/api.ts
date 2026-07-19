import { MarketApiError } from './errors';
import { newIdempotencyKey } from '../shared';
import type {
	Cursor,
	IdResponse,
	MarketListing,
	MarketListingDetail,
} from './types';

export interface MarketApiOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export interface MarketApi {
	listActive(c?: Cursor): Promise<MarketListing[]>;
	listingDetail(id: number): Promise<MarketListingDetail>;
	myAccountId(): Promise<string | null>;
	createListing(body: {
		src_item_id: string;
		qty: number | null;
		buy_now_price: number | null;
		min_bid: number | null;
		expires_at: string;
	}): Promise<IdResponse>;
	placeBid(id: number, amount: number): Promise<IdResponse>;
	buyNow(id: number): Promise<IdResponse>;
	cancelListing(id: number, reason?: string | null): Promise<void>;
}

function query(
	params: Record<string, string | number | null | undefined>,
): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === null || v === undefined || v === '') continue;
		usp.set(k, String(v));
	}
	const s = usp.toString();
	return s ? `?${s}` : '';
}

interface Req {
	path: string;
	method?: string;
	body?: unknown;
	auth?: boolean;
}

export function createMarketApi(opts: MarketApiOptions): MarketApi {
	const { getToken, baseUrl = '' } = opts;

	async function call<T>({
		path,
		method = 'GET',
		body,
		auth = false,
	}: Req): Promise<T> {
		const headers: Record<string, string> = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (auth) {
			const token = await getToken().catch(() => null);
			if (!token) throw new MarketApiError('Not signed in', 401);
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
			throw new MarketApiError(
				e instanceof Error ? e.message : 'request failed',
				0,
			);
		}
		const text = await res.text();
		let json: unknown;
		try {
			json = text ? JSON.parse(text) : undefined;
		} catch {
			json = undefined;
		}
		if (!res.ok) {
			const j = (json ?? {}) as {
				error?: string;
				message?: string;
				detail?: string;
			};
			throw new MarketApiError(
				j.message ?? j.error ?? j.detail ?? (text || `HTTP ${res.status}`),
				res.status,
				j.error,
			);
		}
		return json as T;
	}

	return {
		listActive: (c = {}) =>
			call<MarketListing[]>({
				path: `/api/v1/market/listings${query({
					limit: c.limit ?? 25,
					before_created_at: c.before_created_at,
					before_id: c.before_id,
				})}`,
			}),
		listingDetail: (id) =>
			call<MarketListingDetail>({
				path: `/api/v1/market/listings/${id}`,
			}),
		myAccountId: async () => {
			try {
				const r = await call<{ account_id?: string }>({
					path: '/api/v1/wallet/me/balance',
					auth: true,
				});
				return r?.account_id ?? null;
			} catch {
				return null;
			}
		},
		createListing: (body) =>
			call<IdResponse>({
				path: '/api/v1/market/listings',
				method: 'POST',
				body: { ...body, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		placeBid: (id, amount) =>
			call<IdResponse>({
				path: `/api/v1/market/listings/${id}/bid`,
				method: 'POST',
				body: { amount, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		buyNow: (id) =>
			call<IdResponse>({
				path: `/api/v1/market/listings/${id}/buy-now`,
				method: 'POST',
				body: { idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		cancelListing: (id, reason = null) =>
			call<void>({
				path: `/api/v1/market/listings/${id}/cancel`,
				method: 'POST',
				body: { reason },
				auth: true,
			}),
	};
}
