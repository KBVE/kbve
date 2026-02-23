// Hooks
export { useDroid } from './hooks/useDroid';
export type { DroidState } from './hooks/useDroid';
export { useDroidEvents } from './hooks/useDroidEvents';

// React components
export { DroidProvider, useDroidContext } from './react/DroidProvider';
export { DroidStatus } from './react/DroidStatus';

// Auth
export { AuthBridge, useAuthBridge, bootAuth, IDBStorage } from './auth';
export type { OAuthProvider } from './auth';

// Icons
export { DiscordIcon, GitHubIcon, TwitchIcon } from './icons';

// State stores (pass-through from @kbve/droid)
export {
	$auth,
	setAuth,
	resetAuth,
	$currentPath,
	bootRouter,
	$drawerOpen,
	$modalId,
	$activeTooltip,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
	openTooltip,
	closeTooltip,
} from '@kbve/droid';
export type { AuthTone, AuthState } from '@kbve/droid';

// Gateway (pass-through from @kbve/droid)
export { SupabaseGateway } from '@kbve/droid';

// Utilities
export { cn } from './utils/cn';
