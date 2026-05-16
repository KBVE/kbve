import { useMemo, useState } from 'react';

const MC_ASSET_VERSION = '1.21.5';
const MC_TEXTURE_BASE = `https://mcasset.cloud/${MC_ASSET_VERSION}/assets/minecraft/textures/item`;
const MC_BLOCK_BASE = `https://mcasset.cloud/${MC_ASSET_VERSION}/assets/minecraft/textures/block`;

type Props = {
	itemRef: Record<string, unknown> | null | undefined;
	size?: number;
	className?: string;
};

function kindInitial(kind: string): string {
	if (kind === 'mc_item') return 'M';
	if (kind === 'rareicon_item') return 'R';
	if (kind === 'generic') return 'G';
	return kind.charAt(0).toUpperCase() || '?';
}

function kindGradient(kind: string): string {
	switch (kind) {
		case 'mc_item':
			return 'linear-gradient(135deg, #16a34a 0%, #065f46 100%)';
		case 'rareicon_item':
			return 'linear-gradient(135deg, #a855f7 0%, #4c1d95 100%)';
		default:
			return 'linear-gradient(135deg, #475569 0%, #1e293b 100%)';
	}
}

function mcCandidates(id: string): string[] {
	const clean = id.replace(/^minecraft:/, '').toLowerCase();
	return [`${MC_TEXTURE_BASE}/${clean}.png`, `${MC_BLOCK_BASE}/${clean}.png`];
}

export function ItemIcon({ itemRef, size = 64, className }: Props) {
	const [errIdx, setErrIdx] = useState(0);
	const meta = useMemo(() => {
		const r = (itemRef ?? {}) as Record<string, unknown>;
		const kind = typeof r.kind === 'string' ? r.kind : 'generic';
		const id =
			typeof r.id === 'string' || typeof r.id === 'number'
				? String(r.id)
				: '';
		return { kind, id };
	}, [itemRef]);

	const candidates =
		meta.kind === 'mc_item' && meta.id ? mcCandidates(meta.id) : [];
	const src = candidates[errIdx];
	const exhausted = errIdx >= candidates.length;

	if (candidates.length > 0 && !exhausted) {
		return (
			<div
				className={`kbve-item-icon kbve-item-icon--mc${className ? ` ${className}` : ''}`}
				style={{ width: size, height: size }}>
				<img
					src={src}
					alt={`${meta.kind} ${meta.id}`}
					width={size}
					height={size}
					onError={() => setErrIdx((i) => i + 1)}
					style={{
						imageRendering: 'pixelated',
						width: '100%',
						height: '100%',
					}}
					loading="lazy"
				/>
			</div>
		);
	}

	return (
		<div
			className={`kbve-item-icon kbve-item-icon--placeholder${className ? ` ${className}` : ''}`}
			style={{
				width: size,
				height: size,
				background: kindGradient(meta.kind),
			}}
			aria-label={`${meta.kind} ${meta.id || 'unknown'}`}>
			<span style={{ fontSize: size * 0.42 }}>
				{kindInitial(meta.kind)}
			</span>
		</div>
	);
}

export default ItemIcon;
