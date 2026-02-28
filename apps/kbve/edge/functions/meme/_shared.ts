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
import type { JwtClaims } from '../_shared/supabase.ts';

// Meme-specific request type
export interface MemeRequest {
	token: string;
	claims: JwtClaims;
	body: Record<string, unknown>;
	action: string;
}

// ULID format: 26 Crockford Base32 characters
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function validateMemeId(
	id: unknown,
	field = 'meme_id',
): Response | null {
	if (!id || typeof id !== 'string') {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	if (!ULID_RE.test(id)) {
		return jsonResponse(
			{
				error: `${field} must be a valid ULID (26 chars, Crockford Base32)`,
			},
			400,
		);
	}
	return null;
}

// Reaction type: 1-6 (matching meme_reactions CHECK constraint)
export function validateReaction(reaction: unknown): Response | null {
	const num = Number(reaction);
	if (
		reaction === undefined ||
		reaction === null ||
		!Number.isFinite(num) ||
		!Number.isInteger(num) ||
		num < 1 ||
		num > 6
	) {
		return jsonResponse(
			{ error: 'reaction must be an integer between 1 and 6' },
			400,
		);
	}
	return null;
}

// Tag validation: lowercase slug-safe, 1-50 chars
const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function validateTag(tag: unknown): Response | null {
	if (tag === undefined || tag === null) return null;
	if (typeof tag !== 'string' || tag.length < 1 || tag.length > 50) {
		return jsonResponse(
			{ error: 'tag must be a string of 1-50 characters' },
			400,
		);
	}
	if (!TAG_RE.test(tag)) {
		return jsonResponse(
			{
				error: 'tag must be lowercase alphanumeric with hyphens/underscores',
			},
			400,
		);
	}
	return null;
}

// Validate an array of ULID strings (for batch lookups)
export function validateMemeIdArray(
	ids: unknown,
	field = 'meme_ids',
	maxLength = 50,
): Response | null {
	if (!Array.isArray(ids)) {
		return jsonResponse({ error: `${field} must be an array` }, 400);
	}
	if (ids.length === 0) {
		return jsonResponse({ error: `${field} must not be empty` }, 400);
	}
	if (ids.length > maxLength) {
		return jsonResponse(
			{ error: `${field} exceeds maximum of ${maxLength} items` },
			400,
		);
	}
	for (const id of ids) {
		if (typeof id !== 'string' || !ULID_RE.test(id)) {
			return jsonResponse(
				{ error: `Invalid ULID in ${field}: ${id}` },
				400,
			);
		}
	}
	return null;
}

// Require an authenticated user (has sub claim in JWT)
export function requireAuthenticated(claims: JwtClaims): Response | null {
	if (!claims.sub) {
		return jsonResponse({ error: 'Authentication required' }, 401);
	}
	return null;
}
