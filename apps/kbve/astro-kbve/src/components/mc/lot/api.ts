import { getAccessToken } from '@kbve/astro';
import {
	MCSchematicSchema,
	MCVacantLotSchema,
	MCOwnedLotSchema,
	MCViewportLotSchema,
	MCPurchaseLotResponseSchema,
	MCBuildIdResponseSchema,
	MCOkResponseSchema,
	type MCSchematic,
	type MCVacantLot,
	type MCOwnedLot,
	type MCViewportLot,
	type MCPurchaseLotResponse,
	type MCBuildIdResponse,
	type MCOkResponse,
} from '../../../../../../../packages/data/codegen/generated/mc_lot-schema';
import { z } from 'zod';

export class MCLotApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

async function parseError(res: Response): Promise<MCLotApiError> {
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
	} catch {
		// Body read failure — fall through to statusText.
	}
	return new MCLotApiError(detail || res.statusText, res.status, code);
}

type FetchOpts = {
	signal?: AbortSignal;
};

async function publicGet<T>(
	path: string,
	schema: z.ZodSchema<T>,
	opts: FetchOpts = {},
): Promise<T> {
	const res = await fetch(path, { signal: opts.signal });
	if (!res.ok) throw await parseError(res);
	const data = await res.json();
	return schema.parse(data);
}

async function authedFetch<T>(
	path: string,
	schema: z.ZodSchema<T>,
	init: RequestInit & FetchOpts = {},
): Promise<T> {
	const token = await getAccessToken();
	if (!token) {
		throw new MCLotApiError('not authenticated', 401, 'not_authenticated');
	}
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	const res = await fetch(path, {
		...init,
		headers,
		signal: init.signal,
	});
	if (!res.ok) throw await parseError(res);
	if (res.status === 204) return undefined as T;
	const data = await res.json();
	return schema.parse(data);
}

type LotChunkCursor = {
	world?: string;
	limit?: number;
	after_chunk_x?: number | null;
	after_chunk_z?: number | null;
	after_lot_id?: string | null;
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

const Schematics = z.array(MCSchematicSchema);
const VacantLots = z.array(MCVacantLotSchema);
const OwnedLots = z.array(MCOwnedLotSchema);
const ViewportLots = z.array(MCViewportLotSchema);

export function listSchematics(
	category?: string,
	opts: FetchOpts = {},
): Promise<MCSchematic[]> {
	return publicGet(
		`/api/v1/mc/lots/schematics${buildQuery({ category })}`,
		Schematics,
		opts,
	);
}

export function listVacant(
	c: LotChunkCursor = {},
	opts: FetchOpts = {},
): Promise<MCVacantLot[]> {
	return authedFetch(
		`/api/v1/mc/lots/vacant${buildQuery({
			world: c.world,
			limit: c.limit ?? 64,
			after_chunk_x: c.after_chunk_x,
			after_chunk_z: c.after_chunk_z,
			after_lot_id: c.after_lot_id,
		})}`,
		VacantLots,
		opts,
	);
}

export function listMyActive(
	c: LotChunkCursor = {},
	opts: FetchOpts = {},
): Promise<MCOwnedLot[]> {
	return authedFetch(
		`/api/v1/mc/lots/me/active${buildQuery({
			world: c.world,
			limit: c.limit ?? 64,
			after_chunk_x: c.after_chunk_x,
			after_chunk_z: c.after_chunk_z,
			after_lot_id: c.after_lot_id,
		})}`,
		OwnedLots,
		opts,
	);
}

export function listMyTransitional(
	c: LotChunkCursor = {},
	opts: FetchOpts = {},
): Promise<MCOwnedLot[]> {
	return authedFetch(
		`/api/v1/mc/lots/me/transitional${buildQuery({
			world: c.world,
			limit: c.limit ?? 64,
			after_chunk_x: c.after_chunk_x,
			after_chunk_z: c.after_chunk_z,
			after_lot_id: c.after_lot_id,
		})}`,
		OwnedLots,
		opts,
	);
}

export function listViewport(
	q: {
		world?: string;
		min_chunk_x: number;
		max_chunk_x: number;
		min_chunk_z: number;
		max_chunk_z: number;
		state?: number | null;
		limit?: number;
	},
	opts: FetchOpts = {},
): Promise<MCViewportLot[]> {
	return authedFetch(
		`/api/v1/mc/lots/viewport${buildQuery({
			world: q.world,
			min_chunk_x: q.min_chunk_x,
			max_chunk_x: q.max_chunk_x,
			min_chunk_z: q.min_chunk_z,
			max_chunk_z: q.max_chunk_z,
			state: q.state ?? null,
			limit: q.limit ?? 1000,
		})}`,
		ViewportLots,
		opts,
	);
}

export function purchase(
	body: { lot_id: string; idempotency_key: string },
	opts: FetchOpts = {},
): Promise<MCPurchaseLotResponse> {
	return authedFetch(
		'/api/v1/mc/lots/me/purchase',
		MCPurchaseLotResponseSchema,
		{
			method: 'POST',
			body: JSON.stringify(body),
			signal: opts.signal,
		},
	);
}

export function queueBuild(
	body: {
		lot_id: string;
		schematic_id: string;
		idempotency_key: string;
	},
	opts: FetchOpts = {},
): Promise<MCBuildIdResponse> {
	return authedFetch(
		'/api/v1/mc/lots/me/queue-build',
		MCBuildIdResponseSchema,
		{
			method: 'POST',
			body: JSON.stringify(body),
			signal: opts.signal,
		},
	);
}

export function queueDemolish(
	body: { lot_id: string; idempotency_key: string },
	opts: FetchOpts = {},
): Promise<MCBuildIdResponse> {
	return authedFetch(
		'/api/v1/mc/lots/me/queue-demolish',
		MCBuildIdResponseSchema,
		{
			method: 'POST',
			body: JSON.stringify(body),
			signal: opts.signal,
		},
	);
}

export type {
	MCSchematic,
	MCVacantLot,
	MCOwnedLot,
	MCViewportLot,
	MCPurchaseLotResponse,
	MCBuildIdResponse,
	MCOkResponse,
};
