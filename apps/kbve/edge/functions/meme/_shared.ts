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

// UUID format validation
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUserId(
	id: unknown,
	field = 'user_id',
): Response | null {
	if (!id || typeof id !== 'string') {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	if (!UUID_RE.test(id)) {
		return jsonResponse({ error: `${field} must be a valid UUID` }, 400);
	}
	return null;
}

// Comment body: 1-500 characters, non-empty
export function validateCommentBody(body: unknown): Response | null {
	if (!body || typeof body !== 'string') {
		return jsonResponse({ error: 'body is required' }, 400);
	}
	const trimmed = body.trim();
	if (trimmed.length < 1 || trimmed.length > 500) {
		return jsonResponse(
			{ error: 'body must be between 1 and 500 characters' },
			400,
		);
	}
	return null;
}

// Report reason: integer 1-7 (matching meme_reports CHECK constraint)
export function validateReportReason(reason: unknown): Response | null {
	const num = Number(reason);
	if (
		reason === undefined ||
		reason === null ||
		!Number.isFinite(num) ||
		!Number.isInteger(num) ||
		num < 1 ||
		num > 7
	) {
		return jsonResponse(
			{ error: 'reason must be an integer between 1 and 7' },
			400,
		);
	}
	return null;
}

// Report detail: optional, max 2000 characters
export function validateReportDetail(detail: unknown): Response | null {
	if (detail === undefined || detail === null) return null;
	if (typeof detail !== 'string' || detail.length > 2000) {
		return jsonResponse(
			{ error: 'detail must be a string of at most 2000 characters' },
			400,
		);
	}
	return null;
}

// Pagination limit: integer 1-50, returns validated number
export function validateLimit(limit: unknown): {
	value: number;
	error: Response | null;
} {
	if (limit === undefined || limit === null) {
		return { value: 20, error: null };
	}
	const num = Number(limit);
	if (!Number.isInteger(num) || num < 1 || num > 50) {
		return {
			value: 20,
			error: jsonResponse(
				{ error: 'limit must be an integer between 1 and 50' },
				400,
			),
		};
	}
	return { value: num, error: null };
}

// Pagination cursor: optional ULID
export function validateCursor(cursor: unknown): Response | null {
	if (cursor === undefined || cursor === null) return null;
	return validateMemeId(cursor, 'cursor');
}
