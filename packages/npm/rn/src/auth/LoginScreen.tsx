import { useRef } from 'react';
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OAuthProvider } from '@kbve/core';
import { openExternal } from '../platform/openExternal';
import {
	Button,
	Checkbox,
	DiscordIcon,
	GitHubIcon,
	PeekMascot,
	Text,
	tokens,
	toastStore,
	TwitchIcon,
	useShake,
} from '../ui';
import type { ComponentType } from 'react';
import { KBVE_LEGAL_LINKS } from '../config';
import { useAuthActions } from './useAuth';
import { useAuthForm } from './useAuthForm';
import { HCaptcha } from '../captcha/HCaptcha';
import type { HCaptchaHandle } from '../captcha/HCaptcha';

const PROVIDERS: {
	id: OAuthProvider;
	label: string;
	color: string;
	Icon: ComponentType<{ size?: number; color?: string }>;
}[] = [
	{ id: 'discord', label: 'Discord', color: '#5865F2', Icon: DiscordIcon },
	{ id: 'github', label: 'GitHub', color: '#e6edf3', Icon: GitHubIcon },
	{ id: 'twitch', label: 'Twitch', color: '#9146FF', Icon: TwitchIcon },
];

const transition = LinearTransition.duration(220);

export function LoginScreen() {
	const actions = useAuthActions();
	const captcha = useRef<HCaptchaHandle>(null);
	const captchaShake = useShake();
	const form = useAuthForm();
	const {
		isSignUp,
		busy,
		error,
		email,
		password,
		confirm,
		agreed,
		peeking,
		verified,
		captchaToken,
		mismatch,
		canSubmit,
		submitLabel,
		setEmail,
		setPassword,
		setConfirm,
		setAgreed,
		setPeeking,
		setCaptchaToken,
		setMode,
	} = form;

	const submit = () => {
		if (busy) return;
		const invalid = form.validate();
		if (invalid) {
			toastStore.push(invalid, 'warning');
			return;
		}
		if (!verified || !captchaToken) {
			captchaShake.shake();
			toastStore.push('Verify you’re human to continue', 'warning');
			return;
		}
		form.authenticate(captchaToken);
		captcha.current?.reset();
	};

	const captchaHelp = () =>
		toastStore.push(
			'hCaptcha blocks bots — solve the quick puzzle to continue.',
			'neutral',
		);

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.hero}>
				<PeekMascot peeking={peeking} />
				<Text variant="display">KBVE</Text>
				<Text variant="body" tone="muted">
					{isSignUp ? 'Create your account' : 'Welcome back'}
				</Text>
			</View>

			<View style={styles.segment}>
				<Pressable
					style={[
						styles.segmentItem,
						!isSignUp && styles.segmentActive,
					]}
					onPress={() => setMode('sign_in')}>
					<Text
						variant="label"
						tone={!isSignUp ? 'default' : 'muted'}>
						Sign in
					</Text>
				</Pressable>
				<Pressable
					style={[
						styles.segmentItem,
						isSignUp && styles.segmentActive,
					]}
					onPress={() => setMode('sign_up')}>
					<Text variant="label" tone={isSignUp ? 'default' : 'muted'}>
						Create account
					</Text>
				</Pressable>
			</View>

			<Animated.View style={styles.form} layout={transition}>
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
					onFocus={() => setPeeking(true)}
					onBlur={() => setPeeking(false)}
				/>
				{isSignUp ? (
					<TextInput
						style={[styles.input, mismatch && styles.inputError]}
						placeholder="Confirm password"
						placeholderTextColor={tokens.color.textFaint}
						secureTextEntry
						value={confirm}
						onChangeText={setConfirm}
						onFocus={() => setPeeking(true)}
						onBlur={() => setPeeking(false)}
					/>
				) : null}
				{mismatch ? (
					<Text variant="caption" tone="danger" style={styles.hint}>
						Passwords don’t match.
					</Text>
				) : null}

				<Animated.View style={[styles.captchaRow, captchaShake.style]}>
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
				</Animated.View>

				{isSignUp ? (
					<Checkbox
						checked={agreed}
						onChange={setAgreed}
						disabled={busy}>
						<Text variant="caption" tone="muted">
							I agree to the{' '}
							{KBVE_LEGAL_LINKS.map((link, index) => (
								<Text key={link.url}>
									<Text
										variant="caption"
										tone="primary"
										onPress={() => openExternal(link.url)}>
										{link.label}
									</Text>
									{index < KBVE_LEGAL_LINKS.length - 1
										? index === KBVE_LEGAL_LINKS.length - 2
											? ', and '
											: ', '
										: '.'}
								</Text>
							))}
						</Text>
					</Checkbox>
				) : (
					<Text variant="caption" tone="faint" style={styles.hint}>
						A quick anti-bot check protects your account.
					</Text>
				)}

				<Button
					title={submitLabel}
					disabled={busy}
					onPress={submit}
					style={[styles.submit, !canSubmit && styles.submitIdle]}
				/>
			</Animated.View>

			<Animated.View style={styles.oauthSection} layout={transition}>
				<View style={styles.dividerRow}>
					<View style={styles.line} />
					<Text variant="caption" tone="faint">
						or continue with
					</Text>
					<View style={styles.line} />
				</View>

				{isSignUp ? (
					<View style={styles.oauthCompact}>
						{PROVIDERS.map((provider) => (
							<Pressable
								key={provider.id}
								style={[
									styles.providerCompact,
									busy && styles.disabled,
								]}
								disabled={busy}
								onPress={() =>
									actions.signInWithOAuth(provider.id)
								}>
								<provider.Icon
									size={16}
									color={provider.color}
								/>
								<Text variant="caption" weight="medium">
									{provider.label}
								</Text>
							</Pressable>
						))}
					</View>
				) : (
					<View style={styles.oauth}>
						{PROVIDERS.map((provider) => (
							<Pressable
								key={provider.id}
								style={[
									styles.provider,
									busy && styles.disabled,
								]}
								disabled={busy}
								onPress={() =>
									actions.signInWithOAuth(provider.id)
								}>
								<provider.Icon
									size={18}
									color={provider.color}
								/>
								<Text variant="label">
									Continue with {provider.label}
								</Text>
							</Pressable>
						))}
					</View>
				)}
			</Animated.View>

			{busy ? (
				<ActivityIndicator
					color={tokens.color.primary}
					style={styles.spinner}
				/>
			) : null}
			{error ? (
				<Text variant="caption" tone="danger" style={styles.error}>
					{error}
				</Text>
			) : null}

			<HCaptcha ref={captcha} onToken={setCaptchaToken} />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.color.bg,
		paddingTop: tokens.space.xxl,
		paddingHorizontal: tokens.space.xl,
		gap: tokens.space.lg,
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
	inputError: { borderColor: tokens.color.danger },
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
	submitIdle: { opacity: 0.55 },
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
	oauthSection: { gap: tokens.space.md },
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
	oauthCompact: { flexDirection: 'row', gap: tokens.space.sm },
	providerCompact: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: tokens.space.xs,
		paddingVertical: tokens.space.sm,
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
