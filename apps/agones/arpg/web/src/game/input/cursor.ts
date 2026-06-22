import { arpgAsset } from '../config';

export const Cursor = {
	Pointer: 0,
	Hold: 1,
	Take: 2,
} as const;

export type CursorState = (typeof Cursor)[keyof typeof Cursor];

interface CursorSpec {
	path: string;
	hotX: number;
	hotY: number;
	fallback: string;
}

// Hotspots are the click-point inside the 72x72 glove art; tune per asset.
const CURSORS: Record<CursorState, CursorSpec> = {
	[Cursor.Pointer]: {
		path: '/assets/arcade/arpg/ui/cursor/glove3.png',
		hotX: 36,
		hotY: 6,
		fallback: 'default',
	},
	[Cursor.Hold]: {
		path: '/assets/arcade/arpg/ui/cursor/glove2.png',
		hotX: 36,
		hotY: 36,
		fallback: 'grabbing',
	},
	[Cursor.Take]: {
		path: '/assets/arcade/arpg/ui/cursor/glove1.png',
		hotX: 32,
		hotY: 28,
		fallback: 'grab',
	},
};

export function cursorPaths(): string[] {
	return Object.values(CURSORS).map((c) => arpgAsset(c.path));
}

export class CursorController {
	private current: CursorState | -1 = -1;

	constructor(private el: HTMLElement) {}

	set(state: CursorState): void {
		if (state === this.current) return;
		this.current = state;
		const spec = CURSORS[state];
		this.el.style.cursor = `url(${arpgAsset(spec.path)}) ${spec.hotX} ${spec.hotY}, ${spec.fallback}`;
	}

	clear(): void {
		this.current = -1;
		this.el.style.cursor = '';
	}
}
