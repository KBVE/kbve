import { useRef, useState } from 'react';
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import type { OAuthProvider } from '@kbve/core';
import { Button, Text, tokens, toastStore } from '../ui';
import { useAuth, useAuthActions } from './useAuth';
import { HCaptcha } from '../captcha/HCaptcha';
import type { HCaptchaHandle } from '../captcha/HCaptcha';

type Mode = 'sign_in' | 'sign_up';

const PROVIDERS: { id: OAuthProvider; label: string; color: string }[] = [
	{ id: 'discord', label: 'Discord', color: '#5865F2' },
	{ id: 'github', label: 'GitHub', color: '#e6edf3' },
	{ id: 'twitch', label: 'Twitch', color: '#9146FF' },
];

export function LoginScreen() {
	const auth = useAuth();
	const actions = useAuthActions();
	const captcha = useRef<HCaptchaHandle>(null);
	const [mode, setMode] = useState<Mode>('sign_in');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);

	const busy = auth.status === 'authenticating';
	const verified = captchaToken !== null;
	const canSubmit =
		verified && email.length > 0 && password.length > 0 && !busy;
	const submitLabel = mode === 'sign_up' ? 'Create account' : 'Sign in';

	const submit = () => {
		if (!captchaToken) return;
		if (mode === 'sign_up') {
			actions.signUp(email, password, captchaToken);
		} else {
			actions.signInWithPassword(email, password, captchaToken);
		}
		setCaptchaToken(null);
		captcha.current?.reset();
	};

	const captchaHelp = () =>
		toastStore.push(
			'hCaptcha blocks bots — solve the quick puzzle to continue.',
			'neutral',
		);

	return (
		<View style={styles.container}>
			<View style={styles.hero}>
				<Text variant="display">KBVE</Text>
				<Text variant="body" tone="muted">
					{mode === 'sign_up'
						? 'Create your account'
						: 'Welcome back'}
				</Text>
			</View>

			<View style={styles.segment}>
				<Pressable
					style={[
						styles.segmentItem,
						mode === 'sign_in' && styles.segmentActive,
					]}
					onPress={() => setMode('sign_in')}>
					<Text
						variant="label"
						tone={mode === 'sign_in' ? 'default' : 'muted'}>
						Sign in
					</Text>
				</Pressable>
				<Pressable
					style={[
						styles.segmentItem,
						mode === 'sign_up' && styles.segmentActive,
					]}
					onPress={() => setMode('sign_up')}>
					<Text
						variant="label"
						tone={mode === 'sign_up' ? 'default' : 'muted'}>
						Create account
					</Text>
				</Pressable>
			</View>

			<View style={styles.form}>
				<TextInput
					style={styles.input}
					placeholder="Email"
					placeholderTextColor={tokens.color.textFaint}
					autoCapitalize="none"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
				/>
				<TextInput
					style={styles.input}
					placeholder="Password"
					placeholderTextColor={tokens.color.textFaint}
					secureTextEntry
					value={password}
					onChangeText={setPassword}
				/>

				<View style={styles.captchaRow}>
					<Pressable
						style={[
							styles.captcha,
							verified && styles.captchaVerified,
						]}
						disabled={verified || busy}
						onPress={() => captcha.current?.show()}>
						<Text
							variant="label"
							tone={verified ? 'success' : 'muted'}>
							{verified
								? '✓  Verified'
								: '( Verify you’re human )'}
						</Text>
					</Pressable>
					<Pressable
						style={styles.info}
						onPress={captchaHelp}
						hitSlop={8}>
						<Text variant="label" tone="faint">
							?
						</Text>
					</Pressable>
				</View>
				<Text variant="caption" tone="faint" style={styles.hint}>
					{verified
						? 'Thanks — you can continue.'
						: 'A quick anti-bot check protects your account.'}
				</Text>

				<Button
					title={submitLabel}
					disabled={!canSubmit}
					onPress={submit}
					style={styles.submit}
				/>
			</View>

			<View style={styles.dividerRow}>
				<View style={styles.line} />
				<Text variant="caption" tone="faint">
					or continue with
				</Text>
				<View style={styles.line} />
			</View>

			<View style={styles.oauth}>
				{PROVIDERS.map((provider) => (
					<Pressable
						key={provider.id}
						style={[styles.provider, busy && styles.disabled]}
						disabled={busy}
						onPress={() => actions.signInWithOAuth(provider.id)}>
						<View
							style={[
								styles.dot,
								{ backgroundColor: provider.color },
							]}
						/>
						<Text variant="label">
							Continue with {provider.label}
						</Text>
					</Pressable>
				))}
			</View>

			{busy ? (
				<ActivityIndicator
					color={tokens.color.primary}
					style={styles.spinner}
				/>
			) : null}
			{auth.error ? (
				<Text variant="caption" tone="danger" style={styles.error}>
					{auth.error}
				</Text>
			) : null}

			<HCaptcha ref={captcha} onToken={setCaptchaToken} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.color.bg,
		justifyContent: 'center',
		paddingHorizontal: tokens.space.xl,
		gap: tokens.space.xl,
	},
	hero: { alignItems: 'center', gap: tokens.space.xs },
	segment: {
		flexDirection: 'row',
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
		padding: tokens.space.xs,
	},
	segmentItem: {
		flex: 1,
		paddingVertical: tokens.space.sm,
		borderRadius: tokens.radius.md,
		alignItems: 'center',
	},
	segmentActive: { backgroundColor: tokens.color.surfaceAlt },
	form: { gap: tokens.space.md },
	input: {
		width: '100%',
		backgroundColor: tokens.color.surface,
		color: tokens.color.text,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.md,
		fontSize: tokens.font.body,
	},
	captchaRow: {
		flexDirection: 'row',
		gap: tokens.space.sm,
		alignItems: 'stretch',
	},
	captcha: {
		flex: 1,
		paddingVertical: tokens.space.md,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		alignItems: 'center',
		justifyContent: 'center',
	},
	captchaVerified: {
		borderColor: tokens.color.success,
		backgroundColor: '#0e2a1a',
	},
	info: {
		width: 44,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		alignItems: 'center',
		justifyContent: 'center',
	},
	hint: { textAlign: 'center' },
	submit: { marginTop: tokens.space.xs },
	dividerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.md,
	},
	line: {
		flex: 1,
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border,
	},
	oauth: { gap: tokens.space.sm },
	provider: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.md,
		paddingVertical: tokens.space.md,
		paddingHorizontal: tokens.space.lg,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
	},
	dot: { width: 10, height: 10, borderRadius: tokens.radius.pill },
	disabled: { opacity: 0.4 },
	spinner: { marginTop: tokens.space.xs },
	error: { textAlign: 'center' },
});
