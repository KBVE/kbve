/** @jsxImportSource react */
import type { ReactNode  } from 'react';

export const STAGES = ['read', 'map', 'home', 'about'] as const;

export type Stage = (typeof STAGES)[number];


export interface StageDefinition {
	bg: string;
	shape: string; // corresponds to ShapePaths[shape]
	content: ReactNode;
	buttonText: string;
}

export type StageDefinitions = Record<Stage, StageDefinition>;
