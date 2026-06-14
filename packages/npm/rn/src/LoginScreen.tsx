import { useRef, useState } from 'react';
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import type { OAuthProvider } from '@kbve/core';
import { useAuth, useAuthActions } from './useAuth';
import { HCaptcha } from './HCaptcha';
import type { HCaptchaHandle } from './HCaptcha';

const PROVIDERS: OAuthProvider[] = ['discord', 'github', 'twitch'];

type Mode = 'sign_in' | 'sign_up';

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

	return (
		<View style={styles.container}>
			<Text style={styles.title}>KBVE</Text>
			<Text style={styles.subtitle}>
				{mode === 'sign_up'
					? 'Create your account'
					: 'Sign in to continue'}
			</Text>

			<View style={styles.segment}>
				<Pressable
					style={[
						styles.segmentItem,
						mode === 'sign_in' && styles.segmentActive,
					]}
					onPress={() => setMode('sign_in')}>
					<Text
						style={[
							styles.segmentText,
							mode === 'sign_in' && styles.segmentTextActive,
						]}>
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
						style={[
							styles.segmentText,
							mode === 'sign_up' && styles.segmentTextActive,
						]}>
						Create account
					</Text>
				</Pressable>
			</View>

			<TextInput
				style={styles.input}
				placeholder="email"
				placeholderTextColor="#6b7280"
				autoCapitalize="none"
				keyboardType="email-address"
				value={email}
				onChangeText={setEmail}
			/>
			<TextInput
				style={styles.input}
				placeholder="password"
				placeholderTextColor="#6b7280"
				secureTextEntry
				value={password}
				onChangeText={setPassword}
			/>

			<Pressable
				style={[styles.captcha, verified && styles.captchaVerified]}
				disabled={verified || busy}
				onPress={() => captcha.current?.show()}>
				<Text
					style={[
						styles.captchaText,
						verified && styles.captchaTextVerified,
					]}>
					{verified ? '✓  Verified' : 'Verify you’re human'}
				</Text>
			</Pressable>

			<Pressable
				style={[styles.button, !canSubmit && styles.buttonDisabled]}
				disabled={!canSubmit}
				onPress={submit}>
				<Text style={styles.buttonText}>{submitLabel}</Text>
			</Pressable>

			<Text style={styles.divider}>or continue with</Text>
			<View style={styles.providers}>
				{PROVIDERS.map((provider) => (
					<Pressable
						key={provider}
						style={[styles.provider, busy && styles.buttonDisabled]}
						disabled={busy}
						onPress={() => actions.signInWithOAuth(provider)}>
						<Text style={styles.providerText}>{provider}</Text>
					</Pressable>
				))}
			</View>

			{busy ? (
				<ActivityIndicator color="#2d6cdf" style={styles.spinner} />
			) : null}
			{auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}

			<HCaptcha ref={captcha} onToken={setCaptchaToken} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#0b0b0f',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 32,
		gap: 12,
	},
	title: { color: '#fff', fontSize: 32, fontWeight: '700' },
	subtitle: { color: '#9aa0a6', fontSize: 14, marginBottom: 4 },
	segment: {
		flexDirection: 'row',
		backgroundColor: '#16161d',
		borderRadius: 10,
		padding: 4,
		width: '100%',
	},
	segmentItem: {
		flex: 1,
		paddingVertical: 8,
		borderRadius: 7,
		alignItems: 'center',
	},
	segmentActive: { backgroundColor: '#2d6cdf' },
	segmentText: { color: '#9aa0a6', fontSize: 14, fontWeight: '600' },
	segmentTextActive: { color: '#fff' },
	input: {
		width: '100%',
		backgroundColor: '#16161d',
		color: '#fff',
		borderRadius: 8,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
	},
	captcha: {
		width: '100%',
		paddingVertical: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#2a2a35',
		alignItems: 'center',
	},
	captchaVerified: { borderColor: '#22c55e', backgroundColor: '#0e2a1a' },
	captchaText: { color: '#9aa0a6', fontSize: 14, fontWeight: '600' },
	captchaTextVerified: { color: '#22c55e' },
	button: {
		width: '100%',
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#2d6cdf',
		alignItems: 'center',
	},
	buttonDisabled: { opacity: 0.4 },
	buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
	divider: { color: '#6b7280', fontSize: 12, marginVertical: 4 },
	providers: { flexDirection: 'row', gap: 10 },
	provider: {
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#2a2a35',
	},
	providerText: {
		color: '#cbd2d9',
		fontSize: 13,
		textTransform: 'capitalize',
	},
	spinner: { marginTop: 8 },
	error: {
		color: '#ef4444',
		fontSize: 13,
		textAlign: 'center',
		marginTop: 4,
	},
});
