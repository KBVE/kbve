// Re-export all shared utilities from the centralized module
export {
	type JwtClaims,
	parseJwt,
	extractToken,
	jsonResponse,
	createUserClient,
	createServiceClient,
	requireUserToken,
	requireServiceRole,
} from '../_shared/supabase.ts';

import { jsonResponse } from '../_shared/supabase.ts';

// MC-specific request type
export interface McRequest {
	token: string;
	claims: import('../_shared/supabase.ts').JwtClaims;
	body: Record<string, unknown>;
	action: string;
}

// MC UUID format: 32 lowercase hex characters (no dashes), matches SQL CHECK
const MC_UUID_RE = /^[a-f0-9]{32}$/;

export function isValidMcUuid(uuid: unknown): boolean {
	return typeof uuid === 'string' && MC_UUID_RE.test(uuid);
}

export function validateMcUuid(
	uuid: unknown,
	field = 'mc_uuid',
): Response | null {
	if (!uuid || typeof uuid !== 'string') {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	// Accept dashed UUIDs (normalize by stripping dashes)
	const clean = uuid.replace(/-/g, '').toLowerCase();
	if (!MC_UUID_RE.test(clean)) {
		return jsonResponse(
			{ error: `${field} must be a valid Minecraft UUID (32 hex chars)` },
			400,
		);
	}
	return null;
}

export function requireNonEmpty(
	value: unknown,
	field: string,
): Response | null {
	if (!value || (typeof value === 'string' && value.trim() === '')) {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	return null;
}
