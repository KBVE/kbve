import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMarketApi } from '../api';
import { MarketApiError } from '../errors';

const token = async () => 'tok';

describe('createMarketApi', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('listActive builds cursor query, tokenless', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => '[]',
		});
		const api = createMarketApi({
			getToken: async () => null,
			baseUrl: 'https://x',
		});
		await api.listActive({
			limit: 10,
			before_created_at: '2020',
			before_id: 5,
		});
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe(
			'https://x/api/v1/market/listings?limit=10&before_created_at=2020&before_id=5',
		);
		expect(init?.headers?.Authorization).toBeUndefined();
	});

	it('placeBid posts bearer + amount + idempotency_key', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: 9 }),
		});
		const api = createMarketApi({ getToken: token, baseUrl: '' });
		const res = await api.placeBid(3, 250);
		expect(res).toEqual({ id: 9 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/market/listings/3/bid');
		expect(init.headers.Authorization).toBe('Bearer tok');
		const body = JSON.parse(init.body);
		expect(body.amount).toBe(250);
		expect(typeof body.idempotency_key).toBe('string');
	});

	it('authed call without token throws 401 without fetch', async () => {
		const api = createMarketApi({ getToken: async () => null });
		await expect(api.buyNow(1)).rejects.toMatchObject({
			name: 'MarketApiError',
			status: 401,
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('myAccountId returns account_id, null on failure', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ account_id: 'acc-1' }),
		});
		const api = createMarketApi({ getToken: token });
		expect(await api.myAccountId()).toBe('acc-1');
		(global.fetch as any).mockRejectedValue(new Error('down'));
		expect(await api.myAccountId()).toBeNull();
	});

	it('non-OK JSON error surfaces human message over slug; code = error slug', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 409,
			text: async () =>
				JSON.stringify({ error: 'invalid_argument', message: 'amount must be a positive integer' }),
		});
		const api = createMarketApi({ getToken: token });
		const err = await api.placeBid(1, 5).catch((e) => e);
		expect(err).toBeInstanceOf(MarketApiError);
		expect(err.status).toBe(409);
		expect(err.message).toBe('amount must be a positive integer');
		expect(err.code).toBe('invalid_argument');
	});

	it('myListings GETs personal listings with cursor, bearer', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const api = createMarketApi({ getToken: token, baseUrl: 'https://x' });
		await api.myListings({ limit: 50 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/market/me/listings?limit=50');
		expect(init.headers.Authorization).toBe('Bearer tok');
	});

	it('myBids GETs personal bids with before_placed_at cursor', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const api = createMarketApi({ getToken: token, baseUrl: '' });
		await api.myBids({ limit: 10, before_placed_at: '2020', before_id: 3 });
		const [url] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/market/me/bids?limit=10&before_placed_at=2020&before_id=3');
	});

	it('myListings without token throws 401 without fetch', async () => {
		const api = createMarketApi({ getToken: async () => null });
		await expect(api.myListings()).rejects.toMatchObject({ name: 'MarketApiError', status: 401 });
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
