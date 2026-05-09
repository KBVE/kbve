export { useDroid } from './hooks/useDroid';
export type { DroidState } from './hooks/useDroid';
export { useDroidEvents } from './hooks/useDroidEvents';
export { useToast } from './hooks/useToast';
export { useTooltip } from './hooks/useTooltip';
export { useModal } from './hooks/useModal';

export { DroidProvider, useDroidContext } from './react/DroidProvider';
export { DroidStatus } from './react/DroidStatus';
export { ToastContainer } from './react/ToastContainer';
export type { ToastContainerProps } from './react/ToastContainer';
export { ModalOverlay } from './react/ModalOverlay';
export type { ModalOverlayProps } from './react/ModalOverlay';
export { TooltipOverlay } from './react/TooltipOverlay';
export type { TooltipOverlayProps } from './react/TooltipOverlay';

export {
	AuthBridge,
	useAuthBridge,
	bootAuth,
	resolveStaffFlag,
	bootAuthHint,
	clearAuthHint,
	writeAuthHint,
	IDBStorage,
	setSharedToken,
	getSharedToken,
	clearSharedToken,
} from './auth';
export type { OAuthProvider } from './auth';

export { DiscordIcon, GitHubIcon, TwitchIcon } from './icons';

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

export { CanvasOverlay } from './react/CanvasOverlay';
export type { CanvasOverlayProps } from './react/CanvasOverlay';

export { OverlayManager } from '@kbve/droid';
export type { RenderPath } from '@kbve/droid';

export { SupabaseGateway } from '@kbve/droid';

export { cn } from './utils/cn';

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
