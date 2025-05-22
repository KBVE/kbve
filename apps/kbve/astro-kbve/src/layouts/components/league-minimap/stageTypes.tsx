/** @jsxImportSource react */
import type { ReactNode  } from 'react';
import type { ShapePaths } from './Shapes';

export const STAGES = ['read', 'map', 'home', 'about'] as const;

export type Stage = (typeof STAGES)[number];

export interface StageDefinition {
  bg: string;                                // Background image URL
  shape: keyof typeof ShapePaths;            // Shape key to match SVG path
  title: string;                             // Title (for accordion/panel)
  subtitle: string;                          // Short description
  buttonText: string;                        // CTA button text
  badge?: string;                            // Optional tag/badge
  features?: string[];                       // Optional feature list
  content?: ReactNode;                       // Optional legacy JSX content
}

export type StageDefinitions = Record<Stage, StageDefinition>;
