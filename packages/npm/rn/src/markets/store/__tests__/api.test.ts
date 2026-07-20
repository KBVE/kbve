import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStoreApi } from '../api';
import { StoreApiError } from '../errors';

const token = async () => 'tok';

describe('createStoreApi', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('catalog GETs products tokenless from baseUrl', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify([{ product_id: 'p1', slug: 's' }]),
		});
		const api = createStoreApi({ getToken: async () => null, baseUrl: 'https://x' });
		const rows = await api.catalog();
		expect(rows).toEqual([{ product_id: 'p1', slug: 's' }]);
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/store/products');
		expect(init?.headers?.Authorization).toBeUndefined();
	});

	it('buyProduct posts with bearer + injected idempotency_key', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ item_id: 'i1' }),
		});
		const api = createStoreApi({ getToken: token, baseUrl: '' });
		const res = await api.buyProduct('i-am-an-idiot');
		expect(res).toEqual({ item_id: 'i1' });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/store/products/i-am-an-idiot/buy');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(typeof JSON.parse(init.body).idempotency_key).toBe('string');
	});

	it('authed call without token throws StoreApiError 401 and does not fetch', async () => {
		const api = createStoreApi({ getToken: async () => null });
		await expect(api.myOrders()).rejects.toMatchObject({
			name: 'StoreApiError',
			status: 401,
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('non-OK JSON body surfaces human message over slug; code = error slug', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 402,
			text: async () => JSON.stringify({ error: 'insufficient_funds', message: 'not enough credits' }),
		});
		const api = createStoreApi({ getToken: token });
		const err = await api.buyProduct('x').catch((e) => e);
		expect(err).toBeInstanceOf(StoreApiError);
		expect(err.status).toBe(402);
		expect(err.message).toBe('not enough credits');
		expect(err.code).toBe('insufficient_funds');
	});

	it('topupCheckout returns checkout_url', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ checkout_url: 'https://pay' }),
		});
		const api = createStoreApi({ getToken: token });
		expect(await api.topupCheckout('small')).toEqual({ checkout_url: 'https://pay' });
	});

	it('non-OK empty body falls back to HTTP status message', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => '',
		});
		const api = createStoreApi({ getToken: token });
		const err = await api.buyProduct('x').catch((e) => e);
		expect(err).toBeInstanceOf(StoreApiError);
		expect(err.status).toBe(500);
		expect(err.message).toBe('HTTP 500');
	});

	it('staffUpsertProduct POSTs bearer to staff products, returns id', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: 'p9' }),
		});
		const api = createStoreApi({ getToken: token, baseUrl: '' });
		const res = await api.staffUpsertProduct({ slug: 's', title: 't', price: 10 });
		expect(res).toEqual({ id: 'p9' });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/store/staff/products');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body).idempotency_key).toBeUndefined();
	});

	it('staffListOrders GETs staff orders with status query', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => '[]',
		});
		const api = createStoreApi({ getToken: token, baseUrl: 'https://x' });
		await api.staffListOrders('paid');
		const [url] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/store/staff/orders?status=paid');
	});

	it('staffAdvanceOrder POSTs to advance with body', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '' });
		const api = createStoreApi({ getToken: token, baseUrl: '' });
		await api.staffAdvanceOrder(5, { to_status: 'shipped', tracking: { number: 'AB' } });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/store/staff/orders/5/advance');
		expect(JSON.parse(init.body)).toEqual({ to_status: 'shipped', tracking: { number: 'AB' } });
	});

	it('staff call without token throws 401 without fetch', async () => {
		const api = createStoreApi({ getToken: async () => null });
		await expect(api.staffListOrders()).rejects.toMatchObject({ name: 'StoreApiError', status: 401 });
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
