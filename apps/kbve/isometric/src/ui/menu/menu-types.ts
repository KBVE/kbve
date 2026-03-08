export type SettingsCategory = 'general' | 'audio' | 'video' | 'controls';

export interface MenuState {
	isOpen: boolean;
	activeCategory: SettingsCategory;
}
