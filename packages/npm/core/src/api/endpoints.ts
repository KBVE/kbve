import { createApiClient } from './client';
import type { ApiClient, ApiClientConfig } from './client';
import type { components } from './schema';
import type { RequestResult } from '../net';

export type Schemas = components['schemas'];

type R<T> = Promise<RequestResult<T>>;

export interface KbveApi {
	client: ApiClient;
	system: {
		health(): R<Schemas['HealthResponse']>;
		status(): R<Schemas['StatusResponse']>;
	};
	auth: {
		gameToken(body: Schemas['TokenRequest']): R<Schemas['TokenResponse']>;
	};
	profile: {
		me(): R<Schemas['UserProfile']>;
		byUsername(username: string): R<Schemas['UserProfile']>;
		setUsername(body: Schemas['SetUsernameRequest']): R<Schemas['OkDto']>;
	};
	wallet: {
		balance(): R<Schemas['BalanceDto']>;
		coupons(): R<Schemas['CouponDto'][]>;
		redeemCoupon(
			body: Schemas['RedeemCouponBody'],
		): R<Schemas['RedeemCouponDto']>;
	};
	market: {
		listings(): R<Schemas['MarketListingDto'][]>;
		listing(id: number): R<Schemas['MarketListingDetailDto']>;
		myListings(): R<Schemas['MarketMyListingDto'][]>;
		myBids(): R<Schemas['MarketMyBidDto'][]>;
		create(body: Schemas['CreateListingBody']): R<Schemas['MarketIdDto']>;
		bid(
			id: number,
			body: Schemas['PlaceBidBody'],
		): R<Schemas['MarketIdDto']>;
		buyNow(
			id: number,
			body: Schemas['BuyNowBody'],
		): R<Schemas['MarketIdDto']>;
		cancel(id: number, body: Schemas['CancelListingBody']): R<unknown>;
	};
	mc: {
		players(): R<unknown>;
		playerByUuid(uuid: string): R<unknown>;
		texture(hash: string): R<unknown>;
	};
	account: {
		me(): R<unknown>;
		staff(): R<unknown>;
	};
	forum: {
		spaces(): R<Schemas['SpaceRow'][]>;
		tags(): R<Schemas['TagRow'][]>;
		createThread(body: Schemas['CreateThreadBody']): R<unknown>;
		createComment(
			slugOrId: string,
			body: Schemas['CreateCommentBody'],
		): R<unknown>;
	};
	osrs: {
		item(itemId: string): R<unknown>;
	};
	telemetry: {
		report(body: Schemas['ClientEvent']): R<Schemas['OkDto']>;
	};
}

export function createKbveApi(config: ApiClientConfig): KbveApi {
	const client = createApiClient(config);
	return {
		client,
		system: {
			health: () => client.get('/health') as R<Schemas['HealthResponse']>,
			status: () =>
				client.get('/api/status') as R<Schemas['StatusResponse']>,
		},
		auth: {
			gameToken: (body) =>
				client.post('/api/v1/auth/game-token', { body }) as R<
					Schemas['TokenResponse']
				>,
		},
		profile: {
			me: () =>
				client.get('/api/v1/profile/me') as R<Schemas['UserProfile']>,
			byUsername: (username) =>
				client.get('/api/v1/profile/{username}', {
					path: { username },
				}) as R<Schemas['UserProfile']>,
			setUsername: (body) =>
				client.post('/api/v1/profile/username', { body }) as R<
					Schemas['OkDto']
				>,
		},
		wallet: {
			balance: () =>
				client.get('/api/v1/wallet/me/balance') as R<
					Schemas['BalanceDto']
				>,
			coupons: () =>
				client.get('/api/v1/wallet/me/coupons') as R<
					Schemas['CouponDto'][]
				>,
			redeemCoupon: (body) =>
				client.post('/api/v1/wallet/me/redeem-coupon', { body }) as R<
					Schemas['RedeemCouponDto']
				>,
		},
		market: {
			listings: () =>
				client.get('/api/v1/market/listings') as R<
					Schemas['MarketListingDto'][]
				>,
			listing: (id) =>
				client.get('/api/v1/market/listings/{listing_id}', {
					path: { listing_id: id },
				}) as R<Schemas['MarketListingDetailDto']>,
			myListings: () =>
				client.get('/api/v1/market/me/listings') as R<
					Schemas['MarketMyListingDto'][]
				>,
			myBids: () =>
				client.get('/api/v1/market/me/bids') as R<
					Schemas['MarketMyBidDto'][]
				>,
			create: (body) =>
				client.post('/api/v1/market/listings', { body }) as R<
					Schemas['MarketIdDto']
				>,
			bid: (id, body) =>
				client.post('/api/v1/market/listings/{listing_id}/bid', {
					path: { listing_id: id },
					body,
				}) as R<Schemas['MarketIdDto']>,
			buyNow: (id, body) =>
				client.post('/api/v1/market/listings/{listing_id}/buy-now', {
					path: { listing_id: id },
					body,
				}) as R<Schemas['MarketIdDto']>,
			cancel: (id, body) =>
				client.post('/api/v1/market/listings/{listing_id}/cancel', {
					path: { listing_id: id },
					body,
				}),
		},
		mc: {
			players: () => client.get('/api/v1/mc/players'),
			playerByUuid: (uuid) =>
				client.get('/api/v1/mc/players/by-uuid/{uuid}', {
					path: { uuid },
				}),
			texture: (hash) =>
				client.get('/api/v1/mc/textures/{hash}', { path: { hash } }),
		},
		account: {
			me: () => client.get('/api/v1/me'),
			staff: () => client.get('/api/v1/me/staff'),
		},
		forum: {
			spaces: () =>
				client.get('/api/v1/forum/spaces') as R<Schemas['SpaceRow'][]>,
			tags: () =>
				client.get('/api/v1/forum/tags') as R<Schemas['TagRow'][]>,
			createThread: (body) =>
				client.post('/api/v1/forum/threads', { body }),
			createComment: (slugOrId, body) =>
				client.post('/api/v1/forum/t/{slug_or_id}/comments', {
					path: { slug_or_id: slugOrId },
					body,
				}),
		},
		osrs: {
			item: (itemId) =>
				client.get('/api/v1/osrs/{item_id}', {
					path: { item_id: itemId },
				}),
		},
		telemetry: {
			report: (body) =>
				client.post('/api/v1/telemetry/report', { body }) as R<
					Schemas['OkDto']
				>,
		},
	};
}
