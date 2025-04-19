/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />
/// <reference lib="webworker" />

interface Window {
	Alpine: import('alpinejs').Alpine;
}

declare module 'https://esm.sh/@lottiefiles/dotlottie-web' {
	export const DotLottieWorker: any;
}

export type SharedWorkerCommand =
	| { type: 'connect_websocket' }
	| { type: 'close_websocket' }
	| { type: 'fetch_metrics' }
	| { type: 'panel'; payload: PanelRequest }
	| { type: 'db_get'; store: KnownStore; key: string }
	| { type: 'db_set'; store: KnownStore; key: string; value: any }
	| { type: 'db_delete'; store: KnownStore; key: string }
	| { type: 'db_list'; store: KnownStore };

export type CommandPayload<T extends SharedWorkerCommand['type']> =
	Extract<SharedWorkerCommand, { type: T }> extends { type: T }
		? Omit<Extract<SharedWorkerCommand, { type: T }>, 'type'>
		: never;

export const knownStores = ['jsonservers', 'htmlservers', 'meta', 'panel'] as const;
export type KnownStore = (typeof knownStores)[number];


export interface DiscordServer {
	server_id: string;
	owner_id: string;
	lang: number;
	status: number;
	invite: string;
	name: string;
	summary: string;
	description?: string | null;
	website?: string | null;
	logo?: string | null;
	banner?: string | null;
	video?: string | null;
	categories: number;
	updated_at: string;
}

export interface DiscordTag {
	tag_id: string;
	name: string;
	status: number;
}

export interface LiveServerCardsData {
	initial: DiscordServer[];
	servers: Record<string, DiscordServer>;
	refresh(): Promise<void>;
	updateServer(server: DiscordServer): void;
}

export interface CarouselSlide {
	id: string;
	content?: DiscordServer | any;
}

export interface CarouselData {
	slides: CarouselSlide[];
	currentSlideIndex: number;
	autoplay: boolean;
	autoplayInterval: number;
	intervalId: number | null;
	init(): void;
	destroy(): void;
	startAutoplay(): void;
	stopAutoplay(): void;
	previous(): void;
	next(): void;
	goTo(index: number): void;
}

export interface PanelRequest {
	type: 'open' | 'close' | 'toggle';
	id: string;
	payload?: Record<string, any>;
}

export interface PanelState {
	open: boolean;
	id: string;
	payload?: Record<string, any>;
}

export type RenderType = 'lottie' | 'chart' | 'webgl' | 'particles' | 'text';
export type RenderTypeOptionsMap = {
	lottie: { loop?: boolean };
	chart: { data: any[]; config?: object };
	webgl: { shaderSrc: string };
	particles: { particleCount: number };
	text: { content: string; fontSize?: number };
};

export interface RenderMessage<T extends RenderType = RenderType> {
	type: 'render';
	renderType: T;
	canvas: OffscreenCanvas;
	src?: string;
	options?: RenderTypeOptionsMap[T];
}

export type SpecificRenderMessage<T extends RenderType> = RenderMessage<T>;

// ** Web Worker Dedicated Types ** //

export type WebWorkerHandler<T extends WebWorkerCommand> = (msg: T) => Promise<void>;

export type WebWorkerCommand =
	| WebRenderMessage
	| { type: 'destroy'; id: string };

export interface WebRenderMessage<T extends RenderType = RenderType> {
		type: 'render';
		id: string;
		renderType: T;
		canvas: OffscreenCanvas;
		src?: string;
		options?: RenderTypeOptionsMap[T];
	}

export type WebWorkerResponse =
	| { type: 'render_success'; id: string }
	| { type: 'render_error'; id: string; error: string }
	| { type: 'destroy_success'; id: string }
	| { type: 'destroy_error'; id: string; error: string };

export type WebWorkerPayload<T extends WebWorkerCommand['type']> =
	Extract<WebWorkerCommand, { type: T }> extends { type: T }
		? Omit<Extract<WebWorkerCommand, { type: T }>, 'type'>
		: never;