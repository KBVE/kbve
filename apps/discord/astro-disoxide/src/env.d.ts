/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface Window {
	Alpine: import('alpinejs').Alpine;
}

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