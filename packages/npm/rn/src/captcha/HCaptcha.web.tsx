import { forwardRef, useImperativeHandle, useRef } from 'react';
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import { KBVE_HCAPTCHA_SITE_KEY } from '../config';
import type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

export type { HCaptchaHandle, HCaptchaProps } from './HCaptcha.types';

export const HCaptcha = forwardRef<HCaptchaHandle, HCaptchaProps>(
	function HCaptcha(
		{ onToken, onCancel, siteKey = KBVE_HCAPTCHA_SITE_KEY },
		ref,
	) {
		const inner = useRef<HCaptchaWeb>(null);

		useImperativeHandle(
			ref,
			() => ({
				show: () => void inner.current?.execute(),
				reset: () => inner.current?.resetCaptcha(),
			}),
			[],
		);

		return (
			<HCaptchaWeb
				ref={inner}
				sitekey={siteKey}
				size="invisible"
				onVerify={(token) => onToken(token)}
				onError={() => onCancel?.()}
				onExpire={() => onCancel?.()}
			/>
		);
	},
);
