import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Text as DreiText } from '@react-three/drei';
import type { Group } from 'three';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/primitives/Text';

export interface IdiotCardProps {
	revealed: boolean;
}

function CardMesh() {
	const group = useRef<Group>(null);
	useFrame((_, delta) => {
		if (group.current) group.current.rotation.y += delta * 0.6;
	});
	return (
		<group ref={group}>
			<RoundedBox args={[2.3, 3.3, 0.12]} radius={0.14} smoothness={6}>
				<meshStandardMaterial
					color="#7c3aed"
					metalness={0.35}
					roughness={0.35}
				/>
			</RoundedBox>
			<DreiText
				position={[0, 0.9, 0.08]}
				fontSize={0.34}
				color="#fde68a"
				anchorX="center"
				anchorY="middle"
				maxWidth={2}
				textAlign="center">
				I AM AN
			</DreiText>
			<DreiText
				position={[0, 0.3, 0.08]}
				fontSize={0.62}
				color="#fef3c7"
				anchorX="center"
				anchorY="middle"
				maxWidth={2}
				textAlign="center">
				IDIOT
			</DreiText>
			<DreiText
				position={[0, -1.2, 0.08]}
				fontSize={0.16}
				color="#e9d5ff"
				anchorX="center"
				anchorY="middle">
				· KBVE COLLECTIBLE ·
			</DreiText>
		</group>
	);
}

export function IdiotCard({ revealed }: IdiotCardProps) {
	return (
		<View style={styles.stage}>
			<Canvas camera={{ position: [0, 0, 6], fov: 42 }} dpr={[1, 2]}>
				<ambientLight intensity={0.7} />
				<directionalLight position={[3, 4, 5]} intensity={1.1} />
				<Suspense fallback={null}>
					<CardMesh />
				</Suspense>
			</Canvas>
			{!revealed ? (
				<View style={styles.lock}>
					<Text variant="title" style={styles.lockGlyph}>
						🔒
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	stage: {
		height: 320,
		borderRadius: 18,
		overflow: 'hidden',
	},
	lock: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(10,6,20,0.55)',
	},
	lockGlyph: { fontSize: 34 },
});

export default IdiotCard;
