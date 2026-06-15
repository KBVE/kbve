// Auth subpath barrel (@kbve/rn/auth). Web-safe: supabase/executor have .web
// variants (browser-redirect OAuth, no expo); LoginScreen routes external
// links through ../platform/openExternal.web.
export {
	KBVE_SUPABASE_URL,
	KBVE_SUPABASE_ANON_KEY,
	KBVE_HCAPTCHA_SITE_KEY,
} from '../config';
export * from './supabase';
export * from './executor';
export * from './KbveProvider';
export * from './useAuth';
export * from './useStaff';
export * from './AuthGate';
export * from './LoginScreen';
export * from './SetUsernameScreen';
