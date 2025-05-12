export {};

declare global {
	interface Window {
		sitekey: string;         
		hcaptchaOnLoad: Function;
		onSuccess: Function;
		onError: Function; 
		onClose: Function; 
		onExpired: Function;
		hcaptcha: any;
	}
}

declare var hcaptcha: any;