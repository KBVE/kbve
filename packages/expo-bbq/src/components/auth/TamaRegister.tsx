import React, { useEffect, useState, useRef } from 'react';
import { Linking } from 'react-native';
import {
	Button,
	Form,
	H4,
	Input,
	Spinner,
	Text,
	XStack,
	YStack,
	Sheet,
	Checkbox,
	Label,
} from 'tamagui';
import {
	CheckCircle,
	XCircle,
	AlertTriangle,
	Check,
} from '@tamagui/lucide-icons';
import { createSupabaseClient } from '../wrapper/Supabase';
import { HCaptchaWrapper } from '../wrapper/HCaptchaWrapper';
import { useRouter } from 'expo-router';

export function TamaRegisterCheckbox({
	size = '$5',
	isChecked,
	onCheckedChange,
}: {
	size?: string;
	isChecked: boolean;
	onCheckedChange: (value: boolean) => void;
}) {
	const id = `checkbox-${(size || '').toString().slice(1)}`;

	// Function to handle opening links
	const handleLinkPress = async (url: string) => {
		const supported = await Linking.canOpenURL(url);
		if (supported) {
			await Linking.openURL(url);
		} else {
			console.error(`Can't open URL: ${url}`);
		}
	};

	return (
		<XStack alignItems="center" gap="$4">
			<Checkbox
				id={id}
				size={size}
				checked={isChecked}
				onCheckedChange={onCheckedChange}>
				<Checkbox.Indicator>
					<Check />
				</Checkbox.Indicator>
			</Checkbox>

			<Label size={size} htmlFor={id}>
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
							handleLinkPress('https://kbve.com/legal/eula/')
						}
						style={{ color: 'blue' }}>
						EULA
					</Text>
					,{' '}
					<Text
						onPress={() =>
							handleLinkPress('https://kbve.com/legal/privacy/')
						}
						style={{ color: 'blue' }}>
						Privacy Policy
					</Text>
					, and{' '}
					<Text
						onPress={() =>
							handleLinkPress('https://kbve.com/legal/tos/')
						}
						style={{ color: 'blue' }}>
						Terms of Service
					</Text>
					.
				</Text>
			</Label>
		</XStack>
	);
}

export function TamaRegister({
	siteKey,
	supabaseUrl,
	supabaseAnonKey,
}: {
	siteKey: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
}) {
	const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>(
		'off',
	);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const [resetCaptcha, setResetCaptcha] = useState(false); // State to control captcha reset
	const [formValues, setFormValues] = useState({
		email: '',
		username: '',
		password: '',
		passwordConfirm: '',
	});
	const [isAgreed, setIsAgreed] = useState(false); // State for the agreement checkbox
	const [showSheet, setShowSheet] = useState(false); // State for the feedback sheet
	const [sheetMessage, setSheetMessage] = useState(''); // Message to display in the sheet

	// Initialize Supabase client
	const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

	// Router
	const router = useRouter();

	useEffect(() => {
		if (status === 'submitting') {
			const timer = setTimeout(() => setStatus('off'), 2000);
			return () => {
				clearTimeout(timer);
			};
		}
	}, [status]);

	const handleSubmit = async () => {
		if (formValues.password !== formValues.passwordConfirm) {
			setSheetMessage('Passwords do not match');
			setShowSheet(true); // Show error sheet
			return;
		}

		if (!captchaToken) {
			setSheetMessage('Please complete the captcha');
			setShowSheet(true); // Show error sheet
			return;
		}

		if (!isAgreed) {
			setSheetMessage('You must agree to the terms to register.');
			setShowSheet(true); // Show error sheet
			return;
		}

		setStatus('submitting');
		const lowercasedUsername = formValues.username.toLowerCase();
		console.log(
			'Submitting form:',
			formValues.email,
			lowercasedUsername,
			'Captcha:',
			captchaToken,
		);

		const { email, password } = formValues;
		const username = lowercasedUsername;

		try {
			// Call Supabase's signUp method
			const { data, error } = await supabase.auth.signUp({
				email,
				password,
				options: {
					captchaToken, // Pass the hCaptcha token
					data: {
						username, // Custom user metadata
						full_name: username, // Optionally store full name as username
					},
				},
			});

			if (error) {
				console.error('Supabase sign-up error:', error.message);
				setSheetMessage(`Registration failed: ${error.message}`);
				setShowSheet(true); // Show error sheet
				setCaptchaToken(null); // Reset the captcha token on error
				setTimeout(() => setResetCaptcha(true), 100); // Reset captcha after error
			} else {
				console.log('User registered:', data);
				setStatus('submitted');
				setSheetMessage(
					'Registration successful! Redirecting you to your profile...',
				);
				setShowSheet(true); // Show success sheet
				setTimeout(() => {
					router.replace('/profile');
				}, 2000);
			}
		} catch (error) {
			console.error('Error during registration:', error);
			setSheetMessage('An error occurred during registration.');
			setShowSheet(true); // Show error sheet
			setCaptchaToken(null); // Reset captcha token on error
			setTimeout(() => setResetCaptcha(true), 100); // Reset captcha after error
		}
	};

	const handleInputChange = (field: string, value: string) => {
		setFormValues((prev) => ({ ...prev, [field]: value }));
	};

	const handleLinkPress = async (url: string) => {
		const supported = await Linking.canOpenURL(url);
		if (supported) {
			await Linking.openURL(url);
		} else {
			console.error(`Can't open URL: ${url}`);
		}
	};

	// Handle the checked state properly to match the type `CheckedState`
	const handleCheckboxChange = (checked: 'indeterminate' | boolean) => {
		if (checked === 'indeterminate') {
			setIsAgreed(false); // Handle indeterminate state as false
		} else {
			setIsAgreed(checked); // Set to true or false
		}
	};

	return (
		<YStack justifyContent="center" alignItems="center" padding="$4">
			<Form
				alignItems="center"
				gap="$4"
				onSubmit={handleSubmit}
				borderWidth={1}
				borderRadius="$4"
				backgroundColor="$background"
				borderColor="$borderColor"
				padding="$8"
				width="90%" // Default to full width
				maxWidth="800px" // Set a max width to keep the form from getting too wide
			>
				<H4>
					{status === 'off'
						? 'Register'
						: status[0].toUpperCase() + status.slice(1)}
				</H4>

				<Input
					placeholder="Email"
					value={formValues.email}
					onChangeText={(text) => handleInputChange('email', text)}
					keyboardType="email-address"
					size="$4"
					width="100%"
					padding="$2"
				/>

				<Input
					placeholder="Username"
					value={formValues.username}
					onChangeText={(text) => handleInputChange('username', text)}
					size="$4"
					width="100%"
					padding="$2"
				/>

				<Input
					placeholder="Password"
					value={formValues.password}
					onChangeText={(text) => handleInputChange('password', text)}
					secureTextEntry={true}
					size="$4"
					width="100%"
					padding="$2"
				/>

				<Input
					placeholder="Confirm Password"
					value={formValues.passwordConfirm}
					onChangeText={(text) =>
						handleInputChange('passwordConfirm', text)
					}
					secureTextEntry={true}
					size="$4"
					width="100%"
					padding="$2"
				/>

				<YStack marginVertical="$2" gap="$2">
					<Label>
						<XStack alignItems="center">
							<TamaRegisterCheckbox
								isChecked={isAgreed}
								onCheckedChange={handleCheckboxChange}
							/>
						</XStack>
					</Label>
				</YStack>

				{/* Show a warning if the captcha is missing */}
				{!captchaToken && (
					<Button
						disabled
						size="$4"
						backgroundColor="transparent"
						icon={AlertTriangle}>
						<Text color="red">
							Captcha needed before registering
						</Text>
					</Button>
				)}

				{/* Use the HCaptchaWrapper for both web and mobile */}
				<HCaptchaWrapper
					siteKey={siteKey}
					onToken={(token) => {
						setCaptchaToken(token); // Set the captcha token on success
						setResetCaptcha(false); // Reset the reset state
					}}
					onError={(error) => {
						console.error('Captcha error:', error); // Handle captcha errors
						setCaptchaToken(null); // Reset token on error
						setSheetMessage(
							'Captcha verification failed. Please try again.',
						);
						setShowSheet(true);
					}}
					reset={resetCaptcha} // Pass reset trigger to the captcha wrapper
				/>

				<Form.Trigger
					asChild
					disabled={status !== 'off' || !isAgreed || !captchaToken}>
					<Button
						icon={
							status === 'submitting'
								? () => <Spinner />
								: undefined
						}>
						Register
					</Button>
				</Form.Trigger>
			</Form>

			{/* Feedback Sheet */}
			<Sheet
				forceRemoveScrollEnabled={showSheet}
				modal={true}
				open={showSheet}
				onOpenChange={setShowSheet}
				snapPoints={[80]}
				dismissOnOverlayPress={true}>
				<Sheet.Overlay
					animation="lazy"
					enterStyle={{ opacity: 0 }}
					exitStyle={{ opacity: 0 }}
				/>
				<Sheet.Handle />
				<Sheet.Frame
					padding="$4"
					justifyContent="center"
					alignItems="center"
					gap="$5">
					{/* Display the appropriate icon and message based on the captcha or registration state */}
					{captchaToken ? (
						<CheckCircle color="green" size={40} />
					) : (
						<XCircle color="red" size={40} />
					)}
					<Text>{sheetMessage}</Text>
					<Button onPress={() => setShowSheet(false)}>Close</Button>
				</Sheet.Frame>
			</Sheet>
		</YStack>
	);
}

export default TamaRegister;
