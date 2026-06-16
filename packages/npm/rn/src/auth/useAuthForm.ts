import { useState } from 'react';
import { useAuth, useAuthActions } from './useAuth';

export type AuthFormMode = 'sign_in' | 'sign_up';

export type SubmitStatus = 'authenticating' | 'invalid' | 'need_captcha';

export interface SubmitResult {
	status: SubmitStatus;
	error?: string;
}

export interface UseAuthFormOptions {
	initialMode?: AuthFormMode;
}

export interface AuthForm {
	mode: AuthFormMode;
	isSignUp: boolean;
	busy: boolean;
	error: string | null;
	email: string;
	password: string;
	confirm: string;
	agreed: boolean;
	peeking: boolean;
	captchaToken: string | null;
	verified: boolean;
	mismatch: boolean;
	canSubmit: boolean;
	submitLabel: string;
	setEmail: (v: string) => void;
	setPassword: (v: string) => void;
	setConfirm: (v: string) => void;
	setAgreed: (v: boolean) => void;
	setPeeking: (v: boolean) => void;
	setCaptchaToken: (v: string | null) => void;
	setMode: (m: AuthFormMode) => void;
	switchMode: () => void;
	validate: () => string | null;
	authenticate: (token: string) => void;
	submit: () => SubmitResult;
	reset: () => void;
}

export function useAuthForm(options: UseAuthFormOptions = {}): AuthForm {
	const auth = useAuth();
	const actions = useAuthActions();

	const [mode, setMode] = useState<AuthFormMode>(
		options.initialMode ?? 'sign_in',
	);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [agreed, setAgreed] = useState(false);
	const [peeking, setPeeking] = useState(false);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const isSignUp = mode === 'sign_up';
	const busy = auth.status === 'authenticating';
	const verified = captchaToken !== null;
	const mismatch = isSignUp && confirm.length > 0 && password !== confirm;
	const passwordsOk =
		!isSignUp || (confirm.length > 0 && password === confirm);
	const legalOk = !isSignUp || agreed;
	const canSubmit =
		verified &&
		email.length > 0 &&
		password.length > 0 &&
		passwordsOk &&
		legalOk &&
		!busy;
	const submitLabel = isSignUp ? 'Create account' : 'Sign in';
	const error = formError ?? auth.error;

	const validate = (): string | null => {
		if (email.length === 0 || password.length === 0) {
			return 'Enter your email and password.';
		}
		if (isSignUp && !passwordsOk) {
			return 'Passwords don’t match.';
		}
		if (isSignUp && !agreed) {
			return 'Agree to the terms to continue.';
		}
		return null;
	};

	const authenticate = (token: string) => {
		if (isSignUp) {
			actions.signUp(email, password, token);
		} else {
			actions.signInWithPassword(email, password, token);
		}
		setCaptchaToken(null);
		setFormError(null);
	};

	const submit = (): SubmitResult => {
		if (busy) return { status: 'authenticating' };
		const invalid = validate();
		if (invalid) {
			setFormError(invalid);
			return { status: 'invalid', error: invalid };
		}
		if (!captchaToken) {
			return { status: 'need_captcha' };
		}
		setFormError(null);
		authenticate(captchaToken);
		return { status: 'authenticating' };
	};

	const switchMode = () => {
		setMode(isSignUp ? 'sign_in' : 'sign_up');
		setConfirm('');
		setFormError(null);
	};

	const reset = () => {
		setEmail('');
		setPassword('');
		setConfirm('');
		setAgreed(false);
		setCaptchaToken(null);
		setFormError(null);
	};

	return {
		mode,
		isSignUp,
		busy,
		error,
		email,
		password,
		confirm,
		agreed,
		peeking,
		captchaToken,
		verified,
		mismatch,
		canSubmit,
		submitLabel,
		setEmail: (v) => {
			setFormError(null);
			setEmail(v);
		},
		setPassword: (v) => {
			setFormError(null);
			setPassword(v);
		},
		setConfirm,
		setAgreed,
		setPeeking,
		setCaptchaToken,
		setMode,
		switchMode,
		validate,
		authenticate,
		submit,
		reset,
	};
}
