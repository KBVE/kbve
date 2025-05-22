/** @jsxImportSource react */

import type { FC, SVGProps, AriaRole } from 'react';

export type Shape = FC<SVGProps<SVGSVGElement>>;
export type ShapePath = FC<SVGProps<SVGPathElement>>;


export const KShape: Shape  = (props) => (
  <svg
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    aria-hidden="true"
    role={"img" as unknown as AriaRole}
    className="iconify iconify--emojione-monotone"
    preserveAspectRatio="xMidYMid meet"
    fill="#000000"
    {...props}
  >
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


export const Shapes: Record<string, Shape> = {
  K: KShape,
  // B: BShape,
  // V: VShape,
  // E: EShape,
};

export const KShapePath: ShapePath = (props) => (
  <path
    d="M32 2C15.432 2 2 15.432 2 32s13.432 30 30 30s30-13.432 30-30S48.568 2 32 2m6.016 44.508l-8.939-12.666l-2.922 2.961v9.705h-5.963V17.492h5.963v11.955l11.211-11.955h7.836L33.293 29.426l12.518 17.082h-7.795"
    fill="#000000"
    {...props}
  />
);

export const ShapePaths: Record<string, ShapePath> = {
  K: KShapePath,
};