import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../ui/primitives/Button';
import { Text } from '../ui/primitives/Text';
import { tokens } from '../ui/theme';
import { useAuth, useAuthActions } from './useAuth';

const USERNAME_RE = /^[a-z0-9_-]{3,63}$/;

export interface SetUsernameScreenProps {
	title?: string;
	subtitle?: string;
	suggestion?: string;
	variant?: 'screen' | 'modal';
}

export function SetUsernameScreen({
	title = 'Pick a username',
	subtitle = 'Your public KBVE handle — kbve.com/@you',
	suggestion = '',
	variant = 'screen',
}: SetUsernameScreenProps = {}) {
	const auth = useAuth();
	const { setUsername, signOut } = useAuthActions();
	const [value, setValue] = useState(suggestion);
	const [submitting, setSubmitting] = useState(false);
	const trimmed = value.trim().toLowerCase();
	const valid = USERNAME_RE.test(trimmed);
	const showError = trimmed.length > 0 && !valid;

	useEffect(() => {
		if (auth.error) setSubmitting(false);
	}, [auth.error]);

	const submit = () => {
		if (!valid) return;
		setSubmitting(true);
		setUsername(trimmed);
	};

	const body = (
		<View style={styles.container}>
			<View style={styles.hero}>
				<Text variant="display">{title}</Text>
				<Text variant="body" tone="muted">
					{subtitle}
				</Text>
			</View>

			<View style={styles.field}>
				<Text variant="subtitle" tone="faint">
					@
				</Text>
				<TextInput
					style={styles.input}
					placeholder="username"
					placeholderTextColor={tokens.color.textFaint}
					autoCapitalize="none"
					autoCorrect={false}
					autoFocus
					value={value}
					onChangeText={setValue}
					editable={!submitting}
				/>
			</View>
			<Text
				variant="caption"
				tone={showError ? 'danger' : 'faint'}
				style={styles.hint}>
				3–63 characters: lowercase letters, numbers, underscores,
				hyphens.
			</Text>

			<Button
				title="Continue"
				disabled={!valid || submitting}
				loading={submitting}
				onPress={submit}
				style={styles.submit}
			/>
			{auth.error ? (
				<Text
					variant="caption"
					tone="danger"
					style={styles.serverError}>
					{auth.error}
				</Text>
			) : null}

			<Button
				title="Sign out"
				variant="ghost"
				onPress={signOut}
				style={styles.signout}
			/>
		</View>
	);

	if (variant === 'modal') {
		return (
			<Modal transparent animationType="fade" visible>
				<View style={styles.backdrop}>
					<View style={styles.card}>{body}</View>
				</View>
			</Modal>
		);
	}

	return body;
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.color.bg,
		justifyContent: 'center',
		paddingHorizontal: tokens.space.xl,
		gap: tokens.space.lg,
	},
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		paddingHorizontal: tokens.space.lg,
	},
	card: {
		backgroundColor: tokens.color.bg,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
		overflow: 'hidden',
		maxHeight: '80%',
	},
	hero: {
		alignItems: 'center',
		gap: tokens.space.xs,
		marginBottom: tokens.space.md,
	},
	field: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		paddingHorizontal: tokens.space.lg,
	},
	input: {
		flex: 1,
		color: tokens.color.text,
		paddingVertical: tokens.space.md,
		fontSize: tokens.font.body,
	},
	hint: { textAlign: 'center' },
	submit: { marginTop: tokens.space.xs },
	serverError: { textAlign: 'center' },
	signout: { marginTop: tokens.space.md },
});
