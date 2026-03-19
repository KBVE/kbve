import type { ComponentType } from 'react';

export interface ViewDefinition {
	id: string;
	label: string;
	icon: string;
	component: ComponentType;
}
