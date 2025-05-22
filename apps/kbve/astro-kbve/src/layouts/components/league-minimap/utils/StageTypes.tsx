/** @jsxImportSource react */
import { forwardRef } from 'react';
import type { FC, SVGProps, ReactNode } from 'react';
export const STAGES = ['read', 'map', 'home', 'about'] as const;
export type Stage = (typeof STAGES)[number];
export type ShapeKey = 'K';
export type Shape = FC<SVGProps<SVGSVGElement>>;
export type ShapePath = React.ForwardRefExoticComponent<
	SVGProps<SVGPathElement> & React.RefAttributes<SVGPathElement>
>;

export interface StageDefinition {
	bg: string; // Background image URL
	shape: keyof typeof ShapePaths; // Shape key to match SVG path
	title: string; // Title (for accordion/panel)
	subtitle: string; // Short description
	buttonText: string; // CTA button text
	badge?: string; // Optional tag/badge
	features?: string[]; // Optional feature list
	content?: ReactNode; // Optional legacy JSX content
}

export type StageDefinitions = Record<Stage, StageDefinition>;

/* --- Shapes + Paths --- */
export const KShape: Shape = (props) => (
	<svg
		viewBox="0 0 64 64"
		xmlns="http://www.w3.org/2000/svg"
		xmlnsXlink="http://www.w3.org/1999/xlink"
		aria-hidden="true"
		role="img"
		className="iconify iconify--emojione-monotone"
		preserveAspectRatio="xMidYMid meet"
		fill="#000000"
		{...props}>
		<g id="SVGRepo_bgCarrier" strokeWidth={0} />
		<g
			id="SVGRepo_tracerCarrier"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<g id="SVGRepo_iconCarrier">
			<path
				d="M32 2C15.432 2 2 15.432 2 32s13.432 30 30 30s30-13.432 30-30S48.568 2 32 2m6.016 44.508l-8.939-12.666l-2.922 2.961v9.705h-5.963V17.492h5.963v11.955l11.211-11.955h7.836L33.293 29.426l12.518 17.082h-7.795"
				fill="#000000"
			/>
		</g>
	</svg>
);

export const KShapePath = forwardRef<SVGPathElement, SVGProps<SVGPathElement>>(
	(props, ref) => (
		<path
			d="M32 2C15.432 2 2 15.432 2 32s13.432 30 30 30s30-13.432 30-30S48.568 2 32 2m6.016 44.508l-8.939-12.666l-2.922 2.961v9.705h-5.963V17.492h5.963v11.955l11.211-11.955h7.836L33.293 29.426l12.518 17.082h-7.795"
			fill="#000000"
			ref={ref}
			{...props}
		/>
	),
);

export const Shapes: Record<ShapeKey, Shape> = {
	K: KShape,
};

export const ShapePaths: Record<ShapeKey, ShapePath> = {
	K: KShapePath,
};
