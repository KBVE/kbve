import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/primitives/Text';

export interface ItemIconProps {
	itemRef: Record<string, unknown> | null | undefined;
	size?: number;
}

function mcCandidates(id: string): string[] {
	const clean = id.replace(/^minecraft:/, '').toLowerCase();
	return [
		`https://mcasset.cloud/1.21.5/assets/minecraft/textures/item/${clean}.png`,
		`https://mcasset.cloud/1.21.5/assets/minecraft/textures/block/${clean}.png`,
	];
}

const KIND_COLOR: Record<string, string> = {
	mc_item: '#16a34a',
	rareicon_item: '#a855f7',
};

function kindInitial(kind: string): string {
	if (kind === 'mc_item') return 'M';
	if (kind === 'rareicon_item') return 'R';
	if (kind === 'generic') return 'G';
	return kind ? kind[0].toUpperCase() : '?';
}

export function ItemIcon({ itemRef, size = 64 }: ItemIconProps) {
	const meta = useMemo(() => {
		const o = (itemRef ?? {}) as Record<string, unknown>;
		return {
			kind: typeof o.kind === 'string' ? o.kind : 'generic',
			id: typeof o.id === 'string' ? o.id : '',
		};
	}, [itemRef]);
	const [errIdx, setErrIdx] = useState(0);
	const candidates =
		meta.kind === 'mc_item' && meta.id ? mcCandidates(meta.id) : [];
	const exhausted = errIdx >= candidates.length;

	if (candidates.length > 0 && !exhausted) {
		return (
			<Image
				source={{ uri: candidates[errIdx] }}
				onError={() => setErrIdx((i) => i + 1)}
				resizeMode="contain"
				style={{ width: size, height: size }}
			/>
		);
	}
	return (
		<View
			style={[
				styles.ph,
				{
					width: size,
					height: size,
					backgroundColor: KIND_COLOR[meta.kind] ?? '#475569',
				},
			]}>
			<Text
				variant="title"
				style={{ fontSize: size * 0.42, color: '#fff' }}>
				{kindInitial(meta.kind)}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	ph: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
});
