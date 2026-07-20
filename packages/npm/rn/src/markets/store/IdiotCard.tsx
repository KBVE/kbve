import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/primitives/Text';

export interface IdiotCardProps {
	revealed: boolean;
}

export function IdiotCard({ revealed }: IdiotCardProps) {
	return (
		<View style={styles.stage}>
			<View style={styles.card}>
				<Text variant="caption" style={styles.small}>
					I AM AN
				</Text>
				<Text variant="title" style={styles.big}>
					IDIOT
				</Text>
				<Text variant="caption" style={styles.foot}>
					· KBVE COLLECTIBLE ·
				</Text>
			</View>
			{!revealed ? (
				<View style={styles.lock}>
					<Text variant="title">🔒</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	stage: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 24,
	},
	card: {
		width: 200,
		height: 288,
		borderRadius: 18,
		backgroundColor: '#7c3aed',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
	},
	small: { color: '#fde68a' },
	big: { color: '#fef3c7', fontSize: 44, fontWeight: '800' },
	foot: { color: '#e9d5ff' },
	lock: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(10,6,20,0.55)',
	},
});

export default IdiotCard;
