import type { BadgeTone } from './primitives/Badge';

export interface ActionDescriptor {
	id: string;
	label: string;
	icon?: string;
	disabled?: boolean;
	destructive?: boolean;
	execute: () => void;
}

export type CardVariant = 'default' | 'compact' | 'media' | 'stat' | 'action';

export interface CardModel {
	id: string;
	variant?: CardVariant;
	title: string;
	subtitle?: string;
	description?: string;
	imageUrl?: string;
	badge?: string;
	badgeTone?: BadgeTone;
	statValue?: string;
	statDelta?: string;
	disabled?: boolean;
	actions?: readonly ActionDescriptor[];
	onPress?: () => void;
}

export interface MenuItemModel {
	id: string;
	label: string;
	description?: string;
	trailingText?: string;
	badge?: string;
	disabled?: boolean;
	destructive?: boolean;
	onPress: () => void;
}

export interface MenuSectionModel {
	id: string;
	title?: string;
	items: readonly MenuItemModel[];
}

export type UIEntity =
	| ({ kind: 'card' } & CardModel)
	| ({ kind: 'menu-item' } & MenuItemModel);
