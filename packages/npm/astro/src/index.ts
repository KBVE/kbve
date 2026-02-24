// Hooks
export { useDroid } from './hooks/useDroid';
export type { DroidState } from './hooks/useDroid';
export { useDroidEvents } from './hooks/useDroidEvents';
export { useToast } from './hooks/useToast';
export { useTooltip } from './hooks/useTooltip';
export { useModal } from './hooks/useModal';

// React components
export { DroidProvider, useDroidContext } from './react/DroidProvider';
export { DroidStatus } from './react/DroidStatus';
export { ToastContainer } from './react/ToastContainer';
export type { ToastContainerProps } from './react/ToastContainer';
export { ModalOverlay } from './react/ModalOverlay';
export type { ModalOverlayProps } from './react/ModalOverlay';
export { TooltipOverlay } from './react/TooltipOverlay';
export type { TooltipOverlayProps } from './react/TooltipOverlay';

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
	$toasts,
	addToast,
	removeToast,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
	openTooltip,
	closeTooltip,
} from '@kbve/droid';
export type { AuthTone, AuthState } from '@kbve/droid';

// Types (pass-through from @kbve/droid)
export type {
	ToastPayload,
	ToastSeverity,
	TooltipPayload,
	TooltipPosition,
	ModalPayload,
	VirtualNode,
} from '@kbve/droid';
export {
	ToastPayloadSchema,
	ToastSeveritySchema,
	TooltipPayloadSchema,
	TooltipPositionSchema,
	ModalPayloadSchema,
} from '@kbve/droid';

// Gateway (pass-through from @kbve/droid)
export { SupabaseGateway } from '@kbve/droid';

// Utilities
export { cn } from './utils/cn';
