// API seam. Components import ONLY from here — they never know whether data
// came from mock fixtures or the live Rust/Axum API.
//
// Default = mocks (so the whole frontend runs with no backend). To hit the real
// API instead, set VITE_USE_MOCKS=false; every function below already has the
// matching HTTP path, so it's a single flag flip.

import { mockApi } from './mock';
import type {
	Ack,
	ApplyInput,
	CreateGigInput,
	Gig,
	GigList,
	GigQuery,
	TalentList,
	TalentProfile,
	TalentQuery,
	TaxonomyResponse,
	Vertical,
} from './types';

export * from './types';
export { RANKS, RANK_ORDER } from './mock';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';
export const API_BASE = '/api';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		credentials: 'include',
		headers: { 'content-type': 'application/json', ...init?.headers },
		...init,
	});
	if (!res.ok) {
		const body = await res.text();
		throw new ApiError(res.status, body || res.statusText);
	}
	return res.json() as Promise<T>;
}

const qs = <T extends object>(params: T): string => {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
	}
	const s = sp.toString();
	return s ? `?${s}` : '';
};

// ── Query surface ──────────────────────────────────────────────────────

export function fetchVerticals(): Promise<{ verticals: Vertical[] }> {
	return USE_MOCKS ? mockApi.verticals() : api('/verticals');
}

export function fetchTaxonomy(verticalId: number): Promise<TaxonomyResponse> {
	return USE_MOCKS
		? mockApi.taxonomy(verticalId)
		: api(`/verticals/${verticalId}/taxonomy`);
}

export function fetchGigs(query: GigQuery = {}): Promise<GigList> {
	return USE_MOCKS ? mockApi.gigs(query) : api(`/gigs${qs(query)}`);
}

export function fetchGig(id: string): Promise<Gig> {
	return USE_MOCKS ? mockApi.gig(id) : api(`/gigs/${id}`);
}

export function fetchTalent(query: TalentQuery = {}): Promise<TalentList> {
	return USE_MOCKS ? mockApi.talent(query) : api(`/talent${qs(query)}`);
}

export function fetchTalentByHandle(handle: string): Promise<TalentProfile> {
	return USE_MOCKS ? mockApi.talentByHandle(handle) : api(`/talent/${handle}`);
}

export function createGig(input: CreateGigInput): Promise<Gig> {
	return USE_MOCKS
		? mockApi.createGig(input)
		: api('/gigs', { method: 'POST', body: JSON.stringify(input) });
}

export function applyToGig(gigId: string, input: ApplyInput): Promise<Ack> {
	return USE_MOCKS
		? mockApi.applyToGig(gigId, input)
		: api(`/gigs/${gigId}/applications`, {
				method: 'POST',
				body: JSON.stringify(input),
			});
}
