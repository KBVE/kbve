import type { ViewDefinition } from './types';

const views: ViewDefinition[] = [];

export function registerView(view: ViewDefinition) {
	if (!views.find((v) => v.id === view.id)) {
		views.push(view);
	}
}

export function getViews(): readonly ViewDefinition[] {
	return views;
}

export function getView(id: string): ViewDefinition | undefined {
	return views.find((v) => v.id === id);
}
