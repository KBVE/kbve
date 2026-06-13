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
export { NotContent } from './react/NotContent';
export type { NotContentProps } from './react/NotContent';
export { FloatingWindow } from './react/FloatingWindow';
export type { FloatingWindowProps } from './react/FloatingWindow';

export { useDraggable } from './hooks/useDraggable';
export type {
	Position,
	UseDraggableOptions,
	UseDraggableResult,
} from './hooks/useDraggable';
export { useResizable } from './hooks/useResizable';
export type {
	Size,
	UseResizableOptions,
	UseResizableResult,
} from './hooks/useResizable';

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

export { CanvasOverlay } from './react/CanvasOverlay';
export type { CanvasOverlayProps } from './react/CanvasOverlay';

// Overlay manager (pass-through from @kbve/droid)
export { OverlayManager } from '@kbve/droid';
export type { RenderPath } from '@kbve/droid';

// Gateway (pass-through from @kbve/droid)
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
	SiteGraphLoader,
} from './sitegraph';

// Agents dashboard (logic via @kbve/droid, render here)
export * from './agents';
export * from './dashboard';

// Agents core pass-through from @kbve/droid
export { createAgents } from '@kbve/droid';
export type {
	AgentsApi,
	AgentsConfig,
	AgentsNotice,
	AgentsSession,
	AgentTokenRow,
	BotConfigFormDraft,
	DiscordChannel,
	DiscordGuild,
	DiscordshConfig,
	GuildChannels,
} from '@kbve/droid';
export {
	emptyBotConfigFormDraft,
	botConfigToFormDraft,
	botConfigFromFormDraft,
} from '@kbve/droid';

export {
	KbveUsernameSetup,
	type KbveUsernameSetupProps,
	validateUsername,
} from './components/user/KbveUsernameSetup';
