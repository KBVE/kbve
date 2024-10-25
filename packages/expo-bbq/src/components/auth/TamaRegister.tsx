import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Linking } from 'react-native';
import {
	YStack,
	SizableText,
	ScrollView,
	View,
	Button,
	Checkbox,
	XStack,
	Label,
	Text,
	Input,
	Form,
	Spinner,
} from 'tamagui';
import { createSupabaseClient } from '../wrapper/Supabase';
import { HCaptchaWrapper } from '../wrapper/HCaptchaWrapper';
import { useRouter } from 'expo-router';
import { Check } from '@tamagui/lucide-icons';

export function TamaRegister({
	siteKey,
	supabaseUrl,
	supabaseAnonKey,
	onSuccess,
	onError,
}: {
	siteKey: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
	onSuccess?: () => void;
	onError?: (error: string) => void;
}) {
	const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>(
		'off',
	);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const [resetCaptcha, setResetCaptcha] = useState(false);
	const [formValues, setFormValues] = useState({
		email: '',
		username: '',
		password: '',
		passwordConfirm: '',
	});
	const [isAgreed, setIsAgreed] = useState(false);

	const supabase = useMemo(
		() => createSupabaseClient(supabaseUrl, supabaseAnonKey),
		[supabaseUrl, supabaseAnonKey],
	);
	const isMounted = useRef(true);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const handleInputChange = (field: string, value: string) => {
		setFormValues((prev) => ({ ...prev, [field]: value }));
	};

	const handleCheckboxChange = (checked: 'indeterminate' | boolean) => {
		setIsAgreed(checked !== 'indeterminate' && checked);
	};

	const handleLinkPress = async (url: string) => {
		const supported = await Linking.canOpenURL(url);
		if (supported) {
			await Linking.openURL(url);
		} else {
			console.error(`Can't open URL: ${url}`);
		}
	};

	const handleSubmit = async () => {
		if (formValues.password !== formValues.passwordConfirm) {
			if (onError) onError('Passwords do not match');
			return;
		}
		if (!captchaToken) {
			if (onError) onError('Please complete the captcha');
			return;
		}
		if (!isAgreed) {
			if (onError) onError('You must agree to the terms to register.');
			return;
		}

		setStatus('submitting');
		const lowercasedUsername = formValues.username.toLowerCase();

		try {
			const { data, error } = await supabase.auth.signUp({
				email: formValues.email,
				password: formValues.password,
				options: {
					captchaToken,
					data: {
						username: lowercasedUsername,
						full_name: lowercasedUsername,
					},
				},
			});

			if (error) {
				if (onError) onError(`Registration failed: ${error.message}`);
				setCaptchaToken(null);
				setTimeout(() => setResetCaptcha(true), 100);
			} else {
				setStatus('submitted');
				if (onSuccess) onSuccess();
			}
		} catch (error) {
			if (onError) onError('An error occurred during registration.');
			setCaptchaToken(null);
			setTimeout(() => setResetCaptcha(true), 100);
		}
	};

	return (
		<YStack justifyContent="center" alignItems="center" padding="$4">
			<SizableText size="$3" theme="alt2">
				Register with KBVE Auth
			</SizableText>
			<Form
				alignItems="center"
				gap="$4"
				onSubmit={handleSubmit}
				borderWidth={1}
				borderRadius="$4"
				backgroundColor="$background"
				borderColor="$borderColor"
				padding="$8"
				width="90%"
				maxWidth="800px"
			>
				<Input
					placeholder="Email"
					value={formValues.email}
					onChangeText={(text: string) =>
						handleInputChange('email', text)
					}
					size="$4"
					width="100%"
					padding="$2"
				/>
				<Input
					placeholder="Username"
					value={formValues.username}
					onChangeText={(text: string) =>
						handleInputChange('username', text)
					}
					size="$4"
					width="100%"
					padding="$2"
				/>
				<Input
					placeholder="Password"
					value={formValues.password}
					onChangeText={(text: string) =>
						handleInputChange('password', text)
					}
					secureTextEntry
					size="$4"
					width="100%"
					padding="$2"
				/>
				<Input
					placeholder="Confirm Password"
					value={formValues.passwordConfirm}
					onChangeText={(text: string) =>
						handleInputChange('passwordConfirm', text)
					}
					secureTextEntry={true}
					size="$4"
					width="100%"
					padding="$2"
				/>

				<XStack alignItems="center" gap="$4" paddingTop="$4">
					<Checkbox
						checked={isAgreed}
						onCheckedChange={handleCheckboxChange}>
						<Checkbox.Indicator>
							<Check />
						</Checkbox.Indicator>
					</Checkbox>
					<Label>
						<Text>
							I agree to the{' '}
							<Text
								onPress={() =>
									handleLinkPress(
										'https://kbve.com/legal/disclaimer/',
									)
								}
								style={{ color: 'blue' }}>
								Disclaimer
							</Text>
							,{' '}
							<Text
								onPress={() =>
									handleLinkPress(
										'https://kbve.com/legal/eula/',
									)
								}
								style={{ color: 'blue' }}>
								EULA
							</Text>
							,{' '}
							<Text
								onPress={() =>
									handleLinkPress(
										'https://kbve.com/legal/privacy/',
									)
								}
								style={{ color: 'blue' }}>
								Privacy Policy
							</Text>
							, and{' '}
							<Text
								onPress={() =>
									handleLinkPress(
										'https://kbve.com/legal/tos/',
									)
								}
								style={{ color: 'blue' }}>
								Terms of Service
							</Text>
							.
						</Text>
					</Label>
				</XStack>

				<HCaptchaWrapper
					siteKey={siteKey}
					onToken={(token) => {
						setCaptchaToken(token);
						setResetCaptcha(false);
					}}
					onError={(error) => {
						if (onError)
							onError(
								'Captcha verification failed. Please try again.',
							);
						setCaptchaToken(null);
					}}
					reset={resetCaptcha}
				/>

				<Form.Trigger
					asChild
					disabled={
						status === 'submitting' || !isAgreed || !captchaToken
					}>
					<Button
						icon={
							status === 'submitting'
								? () => <Spinner />
								: undefined
						}>
						{status === 'submitting' ? 'Submitting...' : 'Register'}
					</Button>
				</Form.Trigger>
			</Form>
		</YStack>
	);
}

export default TamaRegister;
