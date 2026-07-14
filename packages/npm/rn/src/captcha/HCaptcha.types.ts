export interface HCaptchaHandle {
	show: () => void;
	reset: () => void;
}

export interface HCaptchaProps {
	onToken: (token: string) => void;
	onCancel?: () => void;
	siteKey?: string;
}
