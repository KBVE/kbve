import type { ComponentType, ReactNode } from 'react';

export interface ViewDefinition {
	id: string;
	label: string;
	icon: ReactNode;
	component: ComponentType;
}
