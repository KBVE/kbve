import { forwardRef, useImperativeHandle, useRef } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export const HCAPTCHA_SITE_KEY =
	(import.meta.env.PUBLIC_HCAPTCHA_SITE_KEY as string | undefined) ??
	'e19cf4a6-2168-49a2-88fe-716e97569e88';

export interface KbveCaptchaHandle {
	reset: () => void;
	execute: () => void;
}

export interface KbveCaptchaProps {
	onVerify: (token: string) => void;
	onExpire?: () => void;
	onError?: (err?: unknown) => void;
	size?: 'normal' | 'compact' | 'invisible';
	theme?: 'light' | 'dark';
	siteKey?: string;
}

/**
 * Thin wrapper around @hcaptcha/react-hcaptcha with the KBVE site key baked in.
 * Visible by default (`size="normal"`) — the caller decides when it counts as
 * solved. Imperative `reset()` / `execute()` via ref so forms can clear the
 * widget after a submit, error, or token expiry.
 */
export const KbveCaptcha = forwardRef<KbveCaptchaHandle, KbveCaptchaProps>(
	function KbveCaptcha(
		{
			onVerify,
			onExpire,
			onError,
			size = 'normal',
			theme = 'dark',
			siteKey = HCAPTCHA_SITE_KEY,
		},
		ref,
	) {
		const inner = useRef<HCaptcha>(null);

		useImperativeHandle(
			ref,
			() => ({
				reset: () => inner.current?.resetCaptcha(),
				execute: () => inner.current?.execute(),
			}),
			[],
		);

		return (
			<HCaptcha
				ref={inner}
				sitekey={siteKey}
				size={size}
				theme={theme}
				onVerify={(token) => onVerify(token)}
				onExpire={() => onExpire?.()}
				onChalExpired={() => onExpire?.()}
				onError={(err) => onError?.(err)}
			/>
		);
	},
);

export default KbveCaptcha;
