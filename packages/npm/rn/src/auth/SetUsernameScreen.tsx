import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Text, tokens } from '../ui';
import { useAuth, useAuthActions } from './useAuth';

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/;

export function SetUsernameScreen() {
	const auth = useAuth();
	const { setUsername, signOut } = useAuthActions();
	const [value, setValue] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const trimmed = value.trim();
	const valid = USERNAME_RE.test(trimmed);
	const showError = trimmed.length > 0 && !valid;

	useEffect(() => {
		if (auth.error) setSubmitting(false);
	}, [auth.error]);

	const submit = () => {
		if (!valid) return;
		setSubmitting(true);
		setUsername(trimmed.toLowerCase());
	};

	return (
		<View style={styles.container}>
			<View style={styles.hero}>
				<Text variant="display">Pick a username</Text>
				<Text variant="body" tone="muted">
					Your public KBVE handle — kbve.com/@you
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
				3–24 characters, start with a letter, letters / numbers /
				underscores.
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
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.color.bg,
		justifyContent: 'center',
		paddingHorizontal: tokens.space.xl,
		gap: tokens.space.lg,
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
