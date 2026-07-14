import type { Ionicons } from '@expo/vector-icons';

export type RailIcon = keyof typeof Ionicons.glyphMap;

export type RailEdge = 'left' | 'right' | 'top' | 'bottom';

export type RailOrientation = 'vertical' | 'horizontal';

export type RailMode = 'docked' | 'floating';

export type RailExpandTrigger = 'hover' | 'press' | 'pin';

export interface RailItemModel {
	id: string;
	label: string;
	icon: RailIcon;
	badge?: string | number;
	disabled?: boolean;
	active?: boolean;
	onPress?: () => void;
}

export interface RailGroupModel {
	id: string;
	title?: string;
	items: readonly RailItemModel[];
}

export interface RailState {
	edge: RailEdge;
	mode: RailMode;
	expanded: boolean;
	pinned: boolean;
}

export const railOrientationForEdge = (edge: RailEdge): RailOrientation =>
	edge === 'top' || edge === 'bottom' ? 'horizontal' : 'vertical';
