export const PLAYER_SPRITE_VARIANTS = 8;

export function spriteVariantForName(name: string): number {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) {
		h ^= name.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % PLAYER_SPRITE_VARIANTS;
}

export function isTypingInDom(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	const tag = el.tagName;
	return (
		tag === 'INPUT' ||
		tag === 'TEXTAREA' ||
		(el as HTMLElement).isContentEditable === true
	);
}

export function zoneLabelForTile(t: { x: number; y: number }): string {
	const near = (cx: number, cy: number, r: number) =>
		Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= r;
	if (near(5, 12, 8)) return 'Cloud City Plaza';
	if (near(24, 24, 7)) return 'Goblin Camp';
	if (near(34, 30, 8)) return 'Crystal Cavern';
	return 'The Wilds';
}
