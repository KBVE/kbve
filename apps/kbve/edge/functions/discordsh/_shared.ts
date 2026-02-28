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

// ---------------------------------------------------------------------------
// Discordsh-specific request type
// ---------------------------------------------------------------------------

export interface DiscordshRequest {
	token: string;
	claims: import('../_shared/supabase.ts').JwtClaims;
	body: Record<string, unknown>;
	action: string;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

// Discord snowflake: 17-20 digit string (matches SQL CHECK: ^\d{17,20}$)
const SNOWFLAKE_RE = /^\d{17,20}$/;

export function validateSnowflake(
	id: unknown,
	field = 'server_id',
): Response | null {
	if (!id || typeof id !== 'string') {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	if (!SNOWFLAKE_RE.test(id)) {
		return jsonResponse(
			{ error: `${field} must be a Discord snowflake (17-20 digits)` },
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

// ---------------------------------------------------------------------------
// hCaptcha verification
// ---------------------------------------------------------------------------

const HCAPTCHA_SECRET = Deno.env.get('HCAPTCHA_SECRET');
const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

interface HCaptchaResult {
	success: boolean;
	challenge_ts?: string;
	hostname?: string;
	'error-codes'?: string[];
}

/**
 * Verify an hCaptcha token server-side.
 * Returns null on success, or a Response on failure.
 * Matches the guard pattern used by requireUserToken / validateSnowflake.
 */
export async function verifyCaptcha(
	captchaToken: unknown,
): Promise<Response | null> {
	if (!HCAPTCHA_SECRET) {
		console.error('HCAPTCHA_SECRET not configured');
		return jsonResponse(
			{ error: 'Captcha verification is not configured' },
			500,
		);
	}

	if (
		!captchaToken ||
		typeof captchaToken !== 'string' ||
		captchaToken.trim() === ''
	) {
		return jsonResponse({ error: 'captcha_token is required' }, 400);
	}

	try {
		const params = new URLSearchParams();
		params.set('response', captchaToken);
		params.set('secret', HCAPTCHA_SECRET);

		const res = await fetch(HCAPTCHA_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
		});

		if (!res.ok) {
			console.error('hCaptcha API error:', res.status);
			return jsonResponse(
				{ error: 'Captcha verification service unavailable' },
				502,
			);
		}

		const result: HCaptchaResult = await res.json();

		if (!result.success) {
			console.warn(
				'hCaptcha verification failed:',
				result['error-codes'],
			);
			return jsonResponse(
				{ error: 'Captcha verification failed. Please try again.' },
				400,
			);
		}

		return null;
	} catch (err) {
		console.error('hCaptcha verification error:', err);
		return jsonResponse(
			{ error: 'Captcha verification failed unexpectedly' },
			500,
		);
	}
}
