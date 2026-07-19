export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';
export type BidStatus = 'active' | 'outbid' | 'won' | 'refunded' | 'cancelled';

export interface MarketListing {
	listing_id: number;
	seller_account: string;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	expires_at: string;
	created_at: string;
}

export interface MarketListingDetail extends MarketListing {
	current_bid_id: number | null;
	listing_status: ListingStatus;
	updated_at: string;
	settled_at: string | null;
	bids: Array<Record<string, unknown>>;
}

export interface MyListing {
	listing_id: number;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	current_bid_account: string | null;
	buyer_account: string | null;
	listing_status: ListingStatus;
	expires_at: string;
	created_at: string;
	settled_at: string | null;
}

export interface MyBid {
	bid_id: number;
	listing_id: number;
	amount: number;
	bid_status: BidStatus;
	placed_at: string;
	settled_at: string | null;
	escrow_ledger_id: number;
	refund_ledger_id: number | null;
}

export interface IdResponse {
	id: number;
}

export interface Cursor {
	limit?: number;
	before_created_at?: string | null;
	before_id?: number | null;
}
