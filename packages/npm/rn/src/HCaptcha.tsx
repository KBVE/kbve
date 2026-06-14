import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ElementRef } from 'react';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { KBVE_HCAPTCHA_SITE_KEY } from './config';
import type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

export type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

const CONTROL_MESSAGES = ['open', 'close', 'rendered', 'showHCaptcha'];

export const HCaptcha = forwardRef<HCaptchaHandle, HCaptchaProps>(
	function HCaptcha(
		{ onToken, onCancel, siteKey = KBVE_HCAPTCHA_SITE_KEY },
		ref,
	) {
		const inner = useRef<ElementRef<typeof ConfirmHcaptcha>>(null);

		useImperativeHandle(
			ref,
			() => ({ show: () => inner.current?.show() }),
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
