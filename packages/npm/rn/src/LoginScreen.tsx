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

export function LoginScreen() {
	const auth = useAuth();
	const actions = useAuthActions();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const captcha = useRef<HCaptchaHandle>(null);
	const intent = useRef<'sign_in' | 'sign_up'>('sign_in');
	const busy = auth.status === 'authenticating';

	const challenge = (next: 'sign_in' | 'sign_up') => {
		intent.current = next;
		captcha.current?.show();
	};

	const onToken = (token: string) => {
		if (intent.current === 'sign_up') {
			actions.signUp(email, password, token);
		} else {
			actions.signInWithPassword(email, password, token);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>KBVE</Text>
			<Text style={styles.subtitle}>Sign in to continue</Text>
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
				style={[styles.button, busy && styles.buttonDisabled]}
				disabled={busy}
				onPress={() => challenge('sign_in')}>
				<Text style={styles.buttonText}>Sign in</Text>
			</Pressable>
			<Pressable
				style={[styles.linkButton, busy && styles.buttonDisabled]}
				disabled={busy}
				onPress={() => challenge('sign_up')}>
				<Text style={styles.linkText}>Create account</Text>
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
			<HCaptcha ref={captcha} onToken={onToken} />
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
	subtitle: { color: '#9aa0a6', fontSize: 14, marginBottom: 12 },
	input: {
		width: '100%',
		backgroundColor: '#16161d',
		color: '#fff',
		borderRadius: 8,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
	},
	button: {
		width: '100%',
		marginTop: 4,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#2d6cdf',
		alignItems: 'center',
	},
	buttonDisabled: { opacity: 0.5 },
	buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
	linkButton: { paddingVertical: 4 },
	linkText: { color: '#9aa0a6', fontSize: 13 },
	divider: { color: '#6b7280', fontSize: 12, marginVertical: 8 },
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
