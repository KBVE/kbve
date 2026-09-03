import type { ItemData } from '../types';
import { ITEM_ICON_FALLBACK } from '../data/itemdb';
import {
	ATLAS_URL,
	ATLAS_SIZE,
	TILE_SIZE,
	atlasCell,
} from '../data/itemAtlas.generated';

interface ItemIconProps {
	item: ItemData;
	/** Rendered icon edge in px (default 32). */
	size?: number;
	className?: string;
}

/**
 * Item icon sourced from the generated sprite atlas (frame == item `key`).
 * Items with no atlas slot (key 0 — e.g. local-only extras) fall back to their
 * img URL and then the inline SVG placeholder.
 */
export function ItemIcon({ item, size = 32, className = '' }: ItemIconProps) {
	if (item.key > 0) {
		const cell = atlasCell(item.key);
		const scaled = ATLAS_SIZE * (size / TILE_SIZE);
		return (
			<span
				role="img"
				aria-label={item.name}
				className={`block bg-no-repeat ${className}`}
				style={{
					width: size,
					height: size,
					backgroundImage: `url(${ATLAS_URL})`,
					backgroundSize: `${scaled}px ${scaled}px`,
					backgroundPosition: `-${cell.col * size}px -${cell.row * size}px`,
					imageRendering: 'pixelated',
				}}
			/>
		);
	}
	return (
		<img
			src={item.img}
			alt={item.name}
			width={size}
			height={size}
			onError={(e) => {
				const el = e.currentTarget;
				if (el.src !== ITEM_ICON_FALLBACK) el.src = ITEM_ICON_FALLBACK;
			}}
			className={className}
		/>
	);
}
