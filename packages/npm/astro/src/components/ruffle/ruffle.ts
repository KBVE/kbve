export type RuffleCdn = 'unpkg' | 'jsdelivr';

export type RuffleAutoplay = 'auto' | 'on' | 'off';

export interface RuffleConfig {
	autoplay?: RuffleAutoplay;
	unmuteOverlay?: 'visible' | 'hidden';
	splashScreen?: boolean;
	allowScriptAccess?: boolean;
	letterbox?: 'fullscreen' | 'on' | 'off';
	scale?: 'showAll' | 'noBorder' | 'exactFit' | 'noScale';
	quality?: 'low' | 'medium' | 'high' | 'best';
	wmode?: 'window' | 'opaque' | 'transparent' | 'direct' | 'gpu';
	base?: string | null;
	menu?: boolean;
	upgradeToHttps?: boolean;
	compatibilityRules?: boolean;
	logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
	showSwfDownload?: boolean;
	openUrlMode?: 'allow' | 'confirm' | 'deny';
	allowNetworking?: 'all' | 'internal' | 'none';
	[key: string]: unknown;
}

export interface RuffleLoadOptions {
	url: string;
	parameters?: Record<string, string>;
	base?: string | null;
	allowScriptAccess?: boolean;
	[key: string]: unknown;
}

export interface RuffleSourceOptions {
	cdn?: RuffleCdn;
	version?: string;
	scriptUrl?: string;
}

export interface RufflePlayerElement extends HTMLElement {
	ruffle: (version?: number) => {
		load: (source: string | RuffleLoadOptions) => Promise<void>;
	};
	config?: RuffleLoadOptions | Record<string, unknown>;
	load?: (source: string | RuffleLoadOptions) => Promise<void>;
}

export interface RuffleApi {
	createPlayer: () => RufflePlayerElement;
}

export interface RufflePlayerWindow extends Window {
	RufflePlayer?: {
		config?: RuffleConfig;
		newest?: () => RuffleApi;
	};
}

export const RUFFLE_SCRIPT_ID = 'kbve-ruffle-player-script';
export const RUFFLE_DEFAULT_CDN: RuffleCdn = 'unpkg';
export const RUFFLE_DEFAULT_SCRIPT_URL = 'https://unpkg.com/@ruffle-rs/ruffle';

const CDN_BASE_URLS: Record<RuffleCdn, string> = {
	unpkg: 'https://unpkg.com/@ruffle-rs/ruffle',
	jsdelivr: 'https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle',
};

export function resolveRuffleScriptUrl({
	cdn = RUFFLE_DEFAULT_CDN,
	version,
	scriptUrl,
}: RuffleSourceOptions = {}) {
	if (scriptUrl) return scriptUrl;

	const baseUrl = CDN_BASE_URLS[cdn] ?? CDN_BASE_URLS[RUFFLE_DEFAULT_CDN];
	return version ? `${baseUrl}@${version}` : baseUrl;
}

export function mergeRuffleConfig(
	baseConfig?: RuffleConfig,
	overrideConfig?: RuffleConfig,
): RuffleConfig | undefined {
	const merged = {
		...(baseConfig ?? {}),
		...(overrideConfig ?? {}),
	};

	return Object.keys(merged).length > 0 ? merged : undefined;
}

export function getRuffleWindow(win: Window = window): RufflePlayerWindow {
	return win as RufflePlayerWindow;
}
