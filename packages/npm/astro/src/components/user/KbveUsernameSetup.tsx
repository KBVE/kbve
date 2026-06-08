import React, { useState } from 'react';
import { User, Check, AlertCircle, Loader2 } from 'lucide-react';

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export interface KbveUsernameSetupProps {
	accessToken: string;
	onComplete: (username: string) => void;
	apiBaseUrl?: string;
}

export function validateUsername(username: string): string | null {
	if (username.length < 3) return 'Must be at least 3 characters';
	if (username.length > 24) return 'Must be 24 characters or fewer';
	if (!/^[a-zA-Z]/.test(username)) return 'Must start with a letter';
	if (!USERNAME_RE.test(username))
		return 'Only letters, numbers, and underscores';
	return null;
}

export function KbveUsernameSetup({
	accessToken,
	onComplete,
	apiBaseUrl = '',
}: KbveUsernameSetupProps) {
	const [username, setUsername] = useState('');
	const [serverError, setServerError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const dirty = username.length > 0;
	const fieldError = dirty ? validateUsername(username) : null;
	const valid = fieldError === null && dirty;
	const showValid = valid && !submitting;

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!valid || submitting) return;
		setServerError(null);
		setSubmitting(true);
		const normalized = username.toLowerCase();
		try {
			const res = await fetch(`${apiBaseUrl}/api/v1/profile/username`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ username: normalized }),
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as {
					message?: string;
					error?: string;
				} | null;
				setServerError(
					err?.message ?? err?.error ?? `Error ${res.status}`,
				);
				return;
			}
			const body = (await res.json().catch(() => null)) as {
				username?: string;
			} | null;
			onComplete(body?.username ?? normalized);
		} catch {
			setServerError('Network error — please try again');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div style={styles.container}>
			<div style={styles.iconRow}>
				<div style={styles.iconCircle}>
					<User size={24} style={{ color: '#06b6d4' }} />
				</div>
			</div>

			<h2 style={styles.title}>Choose your username</h2>
			<p style={styles.subtitle}>
				This is your unique identity on KBVE. It&apos;ll be used for
				your public profile and across all KBVE services.
			</p>

			<form onSubmit={onSubmit} style={styles.form}>
				<div style={styles.inputWrapper}>
					<span style={styles.prefix}>@</span>
					<input
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						type="text"
						placeholder="your_username"
						maxLength={24}
						autoFocus
						autoComplete="off"
						disabled={submitting}
						style={styles.input}
					/>
					{showValid && (
						<Check
							size={16}
							style={{ color: '#22c55e', flexShrink: 0 }}
						/>
					)}
				</div>

				<div style={styles.hint}>
					{fieldError ? (
						<span style={{ color: '#f87171' }}>
							<AlertCircle
								size={12}
								style={{
									display: 'inline',
									verticalAlign: 'middle',
									marginRight: 4,
								}}
							/>
							{fieldError}
						</span>
					) : showValid ? (
						<span style={{ color: '#22c55e' }}>Looks good</span>
					) : (
						<span>
							3-24 characters, letters, numbers, underscores
						</span>
					)}
				</div>

				{serverError && (
					<div style={styles.error}>
						<AlertCircle size={14} />
						{serverError}
					</div>
				)}

				<button
					type="submit"
					disabled={!valid || submitting}
					style={{
						...styles.button,
						opacity: !valid || submitting ? 0.5 : 1,
						cursor:
							!valid || submitting ? 'not-allowed' : 'pointer',
					}}>
					{submitting ? (
						<>
							<Loader2
								size={16}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
							Setting username...
						</>
					) : (
						'Claim username'
					)}
				</button>
			</form>
		</div>
	);
}

export default KbveUsernameSetup;

const styles: Record<string, React.CSSProperties> = {
	container: {
		background: 'var(--sl-color-bg-accent, #164e63)',
		border: '1px solid var(--sl-color-hairline, #30363d)',
		borderRadius: '0.75rem',
		padding: '1.5rem',
		marginBottom: '1rem',
		textAlign: 'center',
	},
	iconRow: {
		display: 'flex',
		justifyContent: 'center',
		marginBottom: '0.75rem',
	},
	iconCircle: {
		width: 48,
		height: 48,
		borderRadius: '50%',
		background: 'rgba(6, 182, 212, 0.15)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: {
		fontSize: '1.125rem',
		fontWeight: 600,
		color: 'var(--sl-color-white, #e6edf3)',
		margin: '0 0 0.25rem',
	},
	subtitle: {
		fontSize: '0.8125rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: '0 0 1rem',
		lineHeight: 1.5,
	},
	form: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
	inputWrapper: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.25rem',
		background: 'var(--sl-color-bg, #0d1117)',
		border: '1px solid var(--sl-color-hairline, #30363d)',
		borderRadius: '0.5rem',
		padding: '0.5rem 0.75rem',
	},
	prefix: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.875rem',
		fontWeight: 500,
		userSelect: 'none',
	},
	input: {
		flex: 1,
		background: 'transparent',
		border: 'none',
		outline: 'none',
		color: 'var(--sl-color-white, #e6edf3)',
		fontSize: '0.875rem',
		fontFamily: 'monospace',
	},
	hint: {
		fontSize: '0.75rem',
		color: 'var(--sl-color-gray-4, #6e7681)',
		textAlign: 'left',
	},
	error: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.375rem',
		fontSize: '0.75rem',
		color: '#f87171',
		background: 'rgba(239, 68, 68, 0.1)',
		borderRadius: '0.375rem',
		padding: '0.375rem 0.5rem',
	},
	button: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		background:
			'linear-gradient(135deg, var(--sl-color-accent, #06b6d4), var(--sl-color-accent-high, #67e8f9))',
		color: '#0d1117',
		border: 'none',
		borderRadius: '0.5rem',
		padding: '0.625rem 1rem',
		fontSize: '0.875rem',
		fontWeight: 600,
		marginTop: '0.25rem',
		transition: 'opacity 0.2s',
	},
};
