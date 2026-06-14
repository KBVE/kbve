import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import { LogBox } from 'react-native';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { KBVE_HCAPTCHA_SITE_KEY } from './config';
import type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

export type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

const CONTROL_MESSAGES = ['open', 'close', 'rendered', 'showHCaptcha'];

export const HCaptcha = forwardRef<HCaptchaHandle, HCaptchaProps>(
	function HCaptcha(
		{ onToken, onCancel, siteKey = KBVE_HCAPTCHA_SITE_KEY },
		ref,
	) {
		const inner = useRef<ElementRef<typeof ConfirmHcaptcha>>(null);
		const [nonce, setNonce] = useState(0);

		useImperativeHandle(
			ref,
			() => ({
				show: () => inner.current?.show(),
				reset: () => setNonce((n) => n + 1),
			}),
			[],
		);

		const onMessage = (event: { nativeEvent: { data: string } }) => {
			const data = event?.nativeEvent?.data;
			if (!data || CONTROL_MESSAGES.includes(data)) return;
			inner.current?.hide();
			if (data === 'cancel' || data === 'error' || data === 'expired') {
				onCancel?.();
				return;
			}
			onToken(data);
		};

		return (
			<ConfirmHcaptcha
				key={nonce}
				ref={inner}
				siteKey={siteKey}
				baseUrl="https://hcaptcha.com"
				languageCode="en"
				size="invisible"
				onMessage={onMessage}
			/>
		);
	},
);
