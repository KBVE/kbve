import type { ComponentType, ReactNode } from 'react';

export interface ViewDefinition {
	id: string;
	label: string;
	icon: ReactNode;
	component: ComponentType;
	/** Rendered by the view host but omitted from sidebar navigation. */
	hidden?: boolean;
}
