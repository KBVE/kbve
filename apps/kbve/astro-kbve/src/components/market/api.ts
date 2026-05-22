import { getAccessToken } from '@kbve/astro';

export type MarketListing = {
	listing_id: number;
	seller_account: string;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	expires_at: string;
	created_at: string;
};

export type MarketListingDetail = MarketListing & {
	current_bid_id: number | null;
	listing_status: 'active' | 'sold' | 'cancelled' | 'expired';
	updated_at: string;
	settled_at: string | null;
	bids: Array<Record<string, unknown>>;
};

export type MyListing = {
	listing_id: number;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	current_bid_account: string | null;
	buyer_account: string | null;
	listing_status: 'active' | 'sold' | 'cancelled' | 'expired';
	expires_at: string;
	created_at: string;
	settled_at: string | null;
};

export type MyBid = {
	bid_id: number;
	listing_id: number;
	amount: number;
	bid_status: 'active' | 'outbid' | 'won' | 'refunded' | 'cancelled';
	placed_at: string;
	settled_at: string | null;
	escrow_ledger_id: number;
	refund_ledger_id: number | null;
};

export type IdResponse = { id: number };

export class MarketApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

async function parseError(res: Response): Promise<MarketApiError> {
	let detail = '';
	let code: string | undefined;
	try {
		const txt = await res.text();
		try {
			const parsed = JSON.parse(txt);
			detail = parsed.message || parsed.error || txt;
			code = parsed.error;
		} catch {
			detail = txt;
		}
	} catch {}
	return new MarketApiError(detail || res.statusText, res.status, code);
}

async function publicGet<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw await parseError(res);
	return (await res.json()) as T;
}

async function authedFetch<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const token = await getAccessToken();
	if (!token)
		throw new MarketApiError('not authenticated', 401, 'not_authenticated');
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type'))
		headers.set('Content-Type', 'application/json');
	const res = await fetch(path, { ...init, headers });
	if (!res.ok) throw await parseError(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

type Cursor = {
	limit?: number;
	before_created_at?: string | null;
	before_id?: number | null;
};

function buildQuery(
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

export function listActive(c: Cursor = {}): Promise<MarketListing[]> {
	return publicGet<MarketListing[]>(
		`/api/v1/market/listings${buildQuery({
			limit: c.limit ?? 25,
			before_created_at: c.before_created_at,
			before_id: c.before_id,
		})}`,
	);
}

export function listingDetail(id: number): Promise<MarketListingDetail> {
	return publicGet<MarketListingDetail>(`/api/v1/market/listings/${id}`);
}

export function myListings(c: Cursor = {}): Promise<MyListing[]> {
	return authedFetch<MyListing[]>(
		`/api/v1/market/me/listings${buildQuery({
			limit: c.limit ?? 25,
			before_created_at: c.before_created_at,
			before_id: c.before_id,
		})}`,
	);
}

export function myBids(
	c: {
		limit?: number;
		before_placed_at?: string | null;
		before_id?: number | null;
	} = {},
): Promise<MyBid[]> {
	return authedFetch<MyBid[]>(
		`/api/v1/market/me/bids${buildQuery({
			limit: c.limit ?? 25,
			before_placed_at: c.before_placed_at,
			before_id: c.before_id,
		})}`,
	);
}

export function createListing(body: {
	src_item_id: string;
	qty: number | null;
	buy_now_price: number | null;
	min_bid: number | null;
	expires_at: string;
	idempotency_key: string;
}): Promise<IdResponse> {
	return authedFetch<IdResponse>('/api/v1/market/listings', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function placeBid(
	listingId: number,
	body: { amount: number; idempotency_key: string },
): Promise<IdResponse> {
	return authedFetch<IdResponse>(`/api/v1/market/listings/${listingId}/bid`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function buyNow(
	listingId: number,
	body: { idempotency_key: string },
): Promise<IdResponse> {
	return authedFetch<IdResponse>(
		`/api/v1/market/listings/${listingId}/buy-now`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
	);
}

export function cancelListing(
	listingId: number,
	body: { reason?: string | null },
): Promise<void> {
	return authedFetch<void>(`/api/v1/market/listings/${listingId}/cancel`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}
