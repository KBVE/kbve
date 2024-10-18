import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Text } from 'tamagui';

interface HCaptchaWrapperProps {
	siteKey: string;
}

const HCaptchaWrapper: React.FC<HCaptchaWrapperProps> = ({ siteKey }) => {
	const [HCaptchaComponent, setHCaptchaComponent] =
		useState<React.ComponentType<any> | null>(null);
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		const loadHCaptcha = async () => {
			if (Platform.OS === 'web') {
				const { default: HCaptchaWeb } = await import(
					'@hcaptcha/react-hcaptcha'
				);
				setHCaptchaComponent(() => HCaptchaWeb);
			} else {
				const { default: HCaptchaMobile } = await import(
					'@hcaptcha/react-native-hcaptcha'
				);
				setHCaptchaComponent(() => HCaptchaMobile);
			}
		};

		loadHCaptcha();
	}, []);

	const onVerify = (captchaToken: string) => {
		setToken(captchaToken);
		console.log('hCaptcha token:', captchaToken);
	};

	return (
		<View>
			{HCaptchaComponent ? (
				Platform.OS === 'web' ? (
					<HCaptchaComponent sitekey={siteKey} onVerify={onVerify} />
				) : (
					<HCaptchaComponent
						siteKey={siteKey}
						baseUrl="https://hcaptcha.com"
						onMessage={onVerify}
					/>
				)
			) : (
				<Text>Loading hCaptcha...</Text>
			)}

			{token && <Text>Your token: {token}</Text>}
		</View>
	);
};

export default HCaptchaWrapper;
