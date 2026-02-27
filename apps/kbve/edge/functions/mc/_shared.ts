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

// MC-specific request type
export interface McRequest {
	token: string;
	claims: import('../_shared/supabase.ts').JwtClaims;
	body: Record<string, unknown>;
	action: string;
}
