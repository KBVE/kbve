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

// Ruffle
export { ReactRuffle } from './components/ruffle/ReactRuffle';
export type { ReactRuffleProps } from './components/ruffle/ReactRuffle';
export {
	RUFFLE_DEFAULT_CDN,
	RUFFLE_DEFAULT_SCRIPT_URL,
	RUFFLE_SCRIPT_ID,
	getRuffleWindow,
	mergeRuffleConfig,
	resolveRuffleScriptUrl,
} from './components/ruffle/ruffle';
export type {
	RuffleApi,
	RuffleAutoplay,
	RuffleCdn,
	RuffleConfig,
	RuffleLoadOptions,
	RufflePlayerElement,
	RufflePlayerWindow,
	RuffleSourceOptions,
} from './components/ruffle/ruffle';

// Auth
export {
	AuthBridge,
	useAuthBridge,
	bootAuth,
	resolveStaffFlag,
	IDBStorage,
	setSharedToken,
	getSharedToken,
	clearSharedToken,
	registerSupabaseGateway,
	getSupabaseGateway,
	getAccessToken,
	useSession,
} from './auth';
export type { OAuthProvider, SessionView } from './auth';

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

// Canvas overlay
export { CanvasOverlay } from './react/CanvasOverlay';
export type { CanvasOverlayProps } from './react/CanvasOverlay';

// Overlay manager (pass-through from @kbve/droid)
export { OverlayManager } from '@kbve/droid';
export type { RenderPath } from '@kbve/droid';

// Gateway (pass-through from @kbve/droid)
export { SupabaseGateway } from '@kbve/droid';

// Utilities
export { cn } from './utils/cn';

// Sitegraph
export type {
	SiteGraphData,
	SiteGraphNode,
	SiteGraphEntry,
	Extractor,
	ExtractorResult,
	BuildSiteGraphOptions,
	FrontmatterLinksOptions,
	CollectionRefField,
	CollectionRefsOptions,
	SiteGraphProps,
	BacklinksProps,
	SiteGraphLoaderProps,
} from './sitegraph';
export {
	buildSiteGraph,
	markdownExtractor,
	mdxAnchorExtractor,
	frontmatterLinksExtractor,
	collectionRefsExtractor,
	fetchSiteGraph,
	resetSiteGraphCache,
	$siteGraphCache,
	createSiteGraphWorker,
	setSiteGraphWorker,
	clearSiteGraphWorker,
	getSiteGraphWorkerPort,
	fetchViaWorker,
	SITE_GRAPH_WORKER_SOURCE,
	SiteGraph,
	Backlinks,
	SiteGraphLoader,
} from './sitegraph';
