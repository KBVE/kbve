export interface HCaptchaHandle {
	show: () => void;
}

export interface HCaptchaProps {
	onToken: (token: string) => void;
	onCancel?: () => void;
	siteKey?: string;
}
