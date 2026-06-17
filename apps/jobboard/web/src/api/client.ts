// API seam. Components import ONLY from here — they never know whether data
// came from mock fixtures or the live Rust/Axum API.
//
// Default = mocks (so the whole frontend runs with no backend). Set
// VITE_USE_MOCKS=false to hit the real API — but only resources whose backend
// endpoint actually exists AND is seeded (see LIVE below) switch over; the rest
// stay on mocks so flipping the flag never points a screen at a missing route.
// As gig/talent/etc. handlers land, flip their LIVE entry to true.

import { createWorkerPool } from '@kbve/rn';
import { mockApi } from './mock';
import type {
	Ack,
	AdminApplication,
	ApplyInput,
	CreateGigInput,
	DecisionInput,
	Gig,
	GigList,
	GigQuery,
	MembershipApplication,
	SubmitApplicationInput,
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

// Resources whose real Axum endpoint exists and is seeded today. Anything false
// stays on mocks even when VITE_USE_MOCKS=false (no handler yet → would hit the
// SPA fallback and fail to parse). Flip to true when the backend route ships.
const LIVE = {
	verticals: true,
	taxonomy: true,
	gigs: false, // TODO: GET /api/gigs, /api/gigs/:id + seed gig rows
	talent: false, // TODO: GET /api/talent, /api/talent/:handle + seed talent rows
} as const;

/** Use the real endpoint only when mocks are off AND the resource is live. */
const live = (resource: keyof typeof LIVE): boolean =>
	!USE_MOCKS && LIVE[resource];

// Network goes through the @kbve/rn worker pool: on web fetch + JSON parse run
// in the Worker (off the render thread), same-origin cookies still flow. The
// mock path below never touches it.
const pool = createWorkerPool();

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

// Supabase access token, registered once by <AuthBridge/> (main.tsx). Attached
// as a bearer on every API call when signed in; authed routes (/applications,
// /admin/*) require it, public routes ignore it.
let tokenGetter: (() => Promise<string | null>) | null = null;
export function setAuthTokenGetter(fn: () => Promise<string | null>): void {
	tokenGetter = fn;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const token = tokenGetter ? await tokenGetter() : null;
	const res = await pool.request<T>(`${API_BASE}${path}`, {
		method: init?.method,
		headers: {
			'content-type': 'application/json',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(init?.headers as Record<string, string> | undefined),
		},
		body: init?.body as string | undefined,
	});
	if (!res.ok) {
		throw new ApiError(res.status, res.error ?? res.status.toString());
	}
	return res.data as T;
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
	return live('verticals') ? api('/verticals') : mockApi.verticals();
}

export function fetchTaxonomy(verticalId: number): Promise<TaxonomyResponse> {
	return live('taxonomy')
		? api(`/verticals/${verticalId}/taxonomy`)
		: mockApi.taxonomy(verticalId);
}

export function fetchGigs(query: GigQuery = {}): Promise<GigList> {
	return live('gigs') ? api(`/gigs${qs(query)}`) : mockApi.gigs(query);
}

export function fetchGig(id: string): Promise<Gig> {
	return live('gigs') ? api(`/gigs/${id}`) : mockApi.gig(id);
}

export function fetchTalent(query: TalentQuery = {}): Promise<TalentList> {
	return live('talent') ? api(`/talent${qs(query)}`) : mockApi.talent(query);
}

export function fetchTalentByHandle(handle: string): Promise<TalentProfile> {
	return live('talent')
		? api(`/talent/${handle}`)
		: mockApi.talentByHandle(handle);
}

export function createGig(input: CreateGigInput): Promise<Gig> {
	return live('gigs')
		? api('/gigs', { method: 'POST', body: JSON.stringify(input) })
		: mockApi.createGig(input);
}

export function applyToGig(gigId: string, input: ApplyInput): Promise<Ack> {
	return live('gigs')
		? api(`/gigs/${gigId}/applications`, {
				method: 'POST',
				body: JSON.stringify(input),
			})
		: mockApi.applyToGig(gigId, input);
}

// ── Membership / vetting (always live — real endpoints, auth required) ──

export function submitApplication(
	input: SubmitApplicationInput,
): Promise<{ id: string; status: number; created_at: string }> {
	return api('/applications', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

export function fetchMyApplication(): Promise<{
	application: MembershipApplication | null;
}> {
	return api('/applications');
}

export function fetchAdminApplications(): Promise<{
	applications: AdminApplication[];
}> {
	return api('/admin/applications');
}

export function decideApplication(
	id: string,
	input: DecisionInput,
): Promise<{ success: boolean; id: string; status: number }> {
	return api(`/admin/applications/${id}/decision`, {
		method: 'POST',
		body: JSON.stringify(input),
	});
}
