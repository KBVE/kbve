import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme';
import { useActiveOverlay, overlayStore } from '../state/overlayStore';
import { ConfirmationDialog } from './ConfirmationDialog';
import { MenuList } from '../menus/MenuList';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';

const stop = () => undefined;

export function OverlayHost() {
	const overlay = useActiveOverlay();
	return (
		<Modal
			visible={overlay !== null}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={overlayStore.hide}>
			<Pressable style={styles.backdrop} onPress={overlayStore.hide}>
				<Pressable style={styles.container} onPress={stop}>
					{overlay?.type === 'confirm' ? (
						<ConfirmationDialog model={overlay} />
					) : null}
					{overlay?.type === 'menu' ? (
						<Surface style={styles.menu}>
							{overlay.title ? (
								<Text
									variant="subtitle"
									style={styles.menuTitle}>
									{overlay.title}
								</Text>
							) : null}
							<MenuList sections={overlay.sections} />
						</Surface>
					) : null}
					{overlay?.type === 'sheet' ? (
						<View>{overlay.content}</View>
					) : null}
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		padding: tokens.space.xl,
	},
	container: { width: '100%' },
	menu: { gap: tokens.space.md },
	menuTitle: { paddingHorizontal: tokens.space.lg },
});
