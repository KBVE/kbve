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

export interface Vertical {
	id: number;
	slug: string;
	label: string;
	description: string;
	status: number;
	sort_order: number;
}

export function fetchVerticals(): Promise<{ verticals: Vertical[] }> {
	return api('/verticals');
}

export interface TaxonomyItem {
	id: number;
	kind: number;
	kind_label: string;
	name: string;
	label: string;
	status: number;
}

export function fetchTaxonomy(
	verticalId: number,
): Promise<{ vertical_id: number; taxonomy: TaxonomyItem[] }> {
	return api(`/verticals/${verticalId}/taxonomy`);
}
