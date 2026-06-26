import { useEffect, useMemo, useState } from 'react';
import {
	loadItemMeta,
	rarityColor,
	type ItemMeta,
} from '../../entities/itemMeta';
import { ItemIcon } from '../inventory/Inventory';

const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';
const PANEL = 'rgba(18,22,32,0.96)';

// Canonical itemdb page for an item ref. The arpg item ref is the itemdb MDX
// slug (e.g. `mana-potion` -> docs/itemdb/mana-potion.mdx), so the ref drops
// straight into the public URL.
const ITEMDB_URL = (ref: string) => `https://kbve.com/itemdb/${ref}`;

/**
 * In-game item codex: a grid of every item that has real atlas art (the itemdb
 * `has_img` items — placeholder "?" slots are hidden), rendered from the bundled
 * itemdb + sprite atlas. Each tile links out to the item's canonical kbve.com
 * itemdb page. Sibling to the creature bestiary; read-only reference.
 */
export default function ItemCodex({ onClose }: { onClose: () => void }) {
	const [items, setItems] = useState<ItemMeta[]>([]);

	useEffect(() => {
		let alive = true;
		loadItemMeta().then((map) => {
			if (!alive) return;
			const list = [...map.values()]
				.filter((m) => m.hasImg && m.key > 0)
				.sort((a, b) => a.name.localeCompare(b.name));
			setItems(list);
		});
		return () => {
			alive = false;
		};
	}, []);

	const count = useMemo(() => items.length, [items]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 40,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(6,8,12,0.78)',
				backdropFilter: 'blur(4px)',
				fontFamily: 'monospace',
				color: TEXT,
			}}
			onClick={onClose}>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					display: 'flex',
					flexDirection: 'column',
					background: PANEL,
					border: '1px solid rgba(120,138,170,0.4)',
					borderRadius: 10,
					overflow: 'hidden',
					boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
					width: 760,
					height: 470,
				}}>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'baseline',
						padding: '14px 18px',
						borderBottom: '1px solid rgba(120,138,170,0.25)',
					}}>
					<div
						style={{
							fontSize: 16,
							fontWeight: 700,
							color: ACCENT,
						}}>
						ITEM CODEX
					</div>
					<div
						style={{
							display: 'flex',
							gap: 12,
							alignItems: 'baseline',
						}}>
						<span style={{ fontSize: 11, color: MUTED }}>
							{count} items
						</span>
						<button onClick={onClose} style={closeStyle}>
							Esc ✕
						</button>
					</div>
				</div>

				<div
					style={{
						flex: 1,
						overflowY: 'auto',
						padding: 14,
						display: 'grid',
						gridTemplateColumns:
							'repeat(auto-fill, minmax(84px, 1fr))',
						gap: 8,
						alignContent: 'flex-start',
					}}>
					{items.map((m) => (
						<a
							key={m.ref}
							href={ITEMDB_URL(m.ref)}
							target="_blank"
							rel="noopener noreferrer"
							title={`${m.name} — open itemdb`}
							style={tileStyle(rarityColor(m.rarity))}
							onMouseEnter={(e) => {
								e.currentTarget.style.background =
									'rgba(76,90,120,0.35)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background =
									'rgba(76,90,120,0.18)';
							}}>
							<ItemIcon meta={m} itemRef={m.ref} size={48} />
							<span style={nameStyle(rarityColor(m.rarity))}>
								{m.name}
							</span>
						</a>
					))}
				</div>
			</div>
		</div>
	);
}

function tileStyle(rarity: string): React.CSSProperties {
	return {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 6,
		padding: '10px 6px',
		borderRadius: 6,
		border: `1px solid ${rarity}`,
		background: 'rgba(76,90,120,0.18)',
		textDecoration: 'none',
		cursor: 'pointer',
		transition: 'background 120ms',
	};
}

function nameStyle(rarity: string): React.CSSProperties {
	return {
		fontSize: 10,
		lineHeight: 1.2,
		textAlign: 'center',
		color: rarity,
		wordBreak: 'break-word',
	};
}

const closeStyle: React.CSSProperties = {
	padding: '4px 8px',
	fontFamily: 'monospace',
	fontSize: 11,
	borderRadius: 5,
	border: 'none',
	cursor: 'pointer',
	color: TEXT,
	background: 'rgba(76,90,120,0.3)',
};
