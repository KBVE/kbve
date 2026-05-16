export {
	$auth,
	$isStaff,
	setAuth,
	resetAuth,
	AuthFlags,
	AuthPresets,
	hasAuthFlag,
	type AuthTone,
	type AuthFlag,
	type AuthState,
} from './auth';

export { $currentPath, bootRouter } from './router';

export {
	$activeTooltip,
	$drawerOpen,
	$modalId,
	openTooltip,
	closeTooltip,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
} from './ui';

export { $toasts, addToast, removeToast } from './toasts';

export { showWelcomeToast } from './welcome-toast';

export {
	syncThemeToDexie,
	broadcastThemeChange,
	observeThemeChanges,
} from './theme-sync';

export { OverlayManager } from './overlay-manager';
export type { RenderPath } from './overlay-manager';

export {
	$profileCache,
	clearProfileCache,
	fetchAndCacheProfile,
	fetchProfileFromApi,
	getProfileFromCache,
	PROFILE_CACHE_TTL_MS,
	PROFILE_DEFAULT_API_BASE,
	readProfileForFastPaint,
	readSupabaseSessionFromStorage,
	setProfileCache,
	type CachedSupabaseSession,
	type DroidProfile,
	type FetchProfileOptions,
	type ProfileCacheEnvelope,
	type ProfileFastPaintResult,
} from './profile';
