import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Avatar } from '../primitives/Avatar';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { Sheet } from './Sheet';

export interface AccountSheetProps {
	visible: boolean;
	onClose: () => void;
	isAuth: boolean;
	displayName: string;
	avatarUrl?: string;
	onLogin: () => void;
	onLogout: () => void;
	onNavigate: (href: string) => void;
}

/** Cross-platform account sheet — slides up from the bottom on all sizes. */
export function AccountSheet({
	visible,
	onClose,
	isAuth,
	displayName,
	avatarUrl,
	onLogin,
	onLogout,
	onNavigate,
}: AccountSheetProps) {
	const t = useTheme();
	const go = (href: string) => () => {
		onNavigate(href);
		onClose();
	};

	return (
		<Sheet visible={visible} onClose={onClose} placement="bottom">
			<View style={styles.frame}>
				<View style={styles.head}>
					<Avatar
						size={44}
						src={avatarUrl}
						name={displayName}
						alt={displayName}
					/>
					<View style={styles.meta}>
						<Text variant="subtitle" numberOfLines={1}>
							{displayName}
						</Text>
						<Text
							variant="caption"
							tone={isAuth ? 'success' : 'warning'}>
							{isAuth ? 'Authenticated' : 'Guest'}
						</Text>
					</View>
					<Button
						variant="secondary"
						onPress={onClose}
						accessibilityLabel="Close menu"
						style={styles.close}>
						<Text variant="subtitle" weight="bold">
							✕
						</Text>
					</Button>
				</View>

				<View
					style={[styles.seam, { backgroundColor: t.color.border }]}
				/>

				<View style={styles.actions}>
					{isAuth ? (
						<>
							<Button
								variant="secondary"
								title="Profile"
								onPress={go('/dashboard/account/')}
								style={styles.btn}
							/>
							<Button
								variant="secondary"
								title="Settings"
								onPress={go('/settings')}
								style={styles.btn}
							/>
							<Button
								variant="danger-ghost"
								title="Sign Out"
								onPress={() => {
									onLogout();
									onClose();
								}}
								style={styles.btn}
							/>
						</>
					) : (
						<>
							<Button
								variant="primary"
								title="Sign In"
								onPress={() => {
									onLogin();
									onClose();
								}}
								style={styles.btn}
							/>
							<Button
								variant="secondary"
								title="Create Account"
								onPress={go('/auth/register')}
								style={styles.btn}
							/>
						</>
					)}
				</View>
			</View>
		</Sheet>
	);
}

const styles = StyleSheet.create({
	frame: {
		width: '100%',
		maxWidth: 460,
		alignSelf: 'center',
		paddingHorizontal: 20,
		paddingTop: 6,
		paddingBottom: 28,
		gap: 18,
	},
	seam: { height: 1 },
	head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
	meta: { flex: 1, gap: 2, minWidth: 0 },
	close: {
		width: 36,
		height: 36,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	actions: { gap: 10 },
	btn: { width: '100%' },
});
