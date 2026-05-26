import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Shuffle, X } from 'lucide-react';
import { agentsService, type AgentTokenRow } from './agentsService';

const TOKEN_NAME_RE = /^[a-z0-9_-]{3,64}$/;
const SERVICE_RE = /^[a-z0-9_]{2,32}$/;

const SERVICE_PRESETS: Array<{
	value: string;
	label: string;
	hint?: string;
}> = [
	{
		value: 'github',
		label: 'github — PAT',
		hint: 'GitHub personal access token. Used by /github board commands + /gh claim + gh-backfill.',
	},
	{
		value: 'github_webhook',
		label: 'github_webhook — HMAC',
		hint: 'HMAC secret for the GitHub webhook delivery. Set the same value in your repo Settings → Webhooks → Secret.',
	},
	{
		value: 'github_repos',
		label: 'github_repos — repo allowlist (future)',
		hint: 'Comma-separated owner/repo list for this guild. Used by P4 of the agents rollout.',
	},
	{
		value: 'irc',
		label: 'irc — bridge token',
		hint: 'IRC gateway credential for this guild.',
	},
];

interface BaseModalProps {
	onClose: () => void;
}

function ModalShell({
	children,
	onClose,
	title,
}: BaseModalProps & { children: React.ReactNode; title: string }) {
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title}
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0,0,0,0.55)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 9999,
				padding: '1rem',
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div
				ref={dialogRef}
				style={{
					background: 'var(--sl-color-bg-nav, #0d1117)',
					border: '1px solid var(--sl-color-gray-5, #2d2f36)',
					borderRadius: 12,
					maxWidth: 560,
					width: '100%',
					maxHeight: '90vh',
					overflowY: 'auto',
					display: 'flex',
					flexDirection: 'column',
				}}>
				<header
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0.85rem 1.1rem',
						borderBottom:
							'1px solid var(--sl-color-gray-5, #2d2f36)',
					}}>
					<h2 style={{ margin: 0, fontSize: '1rem' }}>{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						style={{
							background: 'transparent',
							border: 'none',
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							cursor: 'pointer',
							padding: 4,
						}}>
						<X size={18} />
					</button>
				</header>
				{children}
			</div>
		</div>
	);
}

function genSecret(bytes = 32): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function AddTokenModal({ onClose }: BaseModalProps) {
	const [tokenName, setTokenName] = useState('');
	const [service, setService] = useState('github_webhook');
	const [tokenValue, setTokenValue] = useState('');
	const [description, setDescription] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const preset = useMemo(
		() => SERVICE_PRESETS.find((p) => p.value === service),
		[service],
	);

	const nameOk = TOKEN_NAME_RE.test(tokenName);
	const serviceOk = SERVICE_RE.test(service);
	const valueOk = tokenValue.length >= 10 && tokenValue.length <= 8000;
	const formValid = nameOk && serviceOk && valueOk && !busy;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!formValid) return;
		setBusy(true);
		setError(null);
		const r = await agentsService.addToken({
			tokenName,
			service,
			tokenValue,
			description: description.trim() || null,
		});
		setBusy(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		onClose();
	}

	return (
		<ModalShell title="Add token" onClose={onClose}>
			<form
				onSubmit={submit}
				style={{
					padding: '1rem 1.1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.85rem',
				}}>
				<Field
					label="Service"
					hint={preset?.hint}
					control={
						<select
							value={service}
							onChange={(e) => setService(e.target.value)}
							style={inputStyle}>
							{SERVICE_PRESETS.map((p) => (
								<option key={p.value} value={p.value}>
									{p.label}
								</option>
							))}
						</select>
					}
				/>

				<Field
					label="Token name"
					hint="Friendly label for this row. 3–64 chars, lowercase a–z, 0–9, _ -"
					error={
						tokenName.length > 0 && !nameOk
							? 'Must match ^[a-z0-9_-]{3,64}$'
							: null
					}
					control={
						<input
							type="text"
							value={tokenName}
							placeholder={
								service === 'github_webhook'
									? 'github-webhook-hmac'
									: 'github-pat'
							}
							onChange={(e) =>
								setTokenName(e.target.value.toLowerCase())
							}
							style={inputStyle}
							autoComplete="off"
							spellCheck={false}
						/>
					}
				/>

				<Field
					label="Token value"
					hint="Stored encrypted in Supabase Vault. Never returned to the dashboard after submission."
					error={
						tokenValue.length > 0 && !valueOk
							? 'Must be 10–8000 chars'
							: null
					}
					control={
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: '0.4rem',
							}}>
							<textarea
								value={tokenValue}
								onChange={(e) => setTokenValue(e.target.value)}
								rows={3}
								spellCheck={false}
								autoComplete="off"
								style={{
									...inputStyle,
									fontFamily:
										'var(--sl-font-mono, ui-monospace, monospace)',
									resize: 'vertical',
								}}
							/>
							{service === 'github_webhook' && (
								<button
									type="button"
									onClick={() => setTokenValue(genSecret(32))}
									style={smallButton}>
									<Shuffle
										size={14}
										style={{ marginRight: 6 }}
									/>
									Generate random 32-byte hex
								</button>
							)}
						</div>
					}
				/>

				<Field
					label="Description (optional)"
					control={
						<input
							type="text"
							value={description}
							maxLength={256}
							placeholder={
								service === 'github_webhook'
									? 'HMAC secret for KBVE/kbve webhook'
									: ''
							}
							onChange={(e) => setDescription(e.target.value)}
							style={inputStyle}
						/>
					}
				/>

				{error && (
					<p
						style={{
							color: '#f87171',
							fontSize: '0.85rem',
							margin: 0,
						}}>
						{error}
					</p>
				)}

				<div
					style={{
						display: 'flex',
						justifyContent: 'flex-end',
						gap: '0.5rem',
					}}>
					<button
						type="button"
						onClick={onClose}
						style={secondaryButton}>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!formValid}
						style={primaryButton(formValid)}>
						{busy ? (
							<Loader2
								size={14}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						) : null}
						{busy ? 'Saving…' : 'Save token'}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

interface DeleteTokenModalProps extends BaseModalProps {
	token: AgentTokenRow;
}

export function DeleteTokenModal({ token, onClose }: DeleteTokenModalProps) {
	const [confirmText, setConfirmText] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const match = confirmText === token.token_name;

	async function submit() {
		if (!match || busy) return;
		setBusy(true);
		setError(null);
		const r = await agentsService.deleteToken(token.token_id);
		setBusy(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		onClose();
	}

	return (
		<ModalShell title="Delete token" onClose={onClose}>
			<div
				style={{
					padding: '1rem 1.1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.85rem',
				}}>
				<p
					style={{
						margin: 0,
						fontSize: '0.9rem',
						color: 'var(--sl-color-gray-2, #c2c5cc)',
					}}>
					This permanently removes the Vault row. The encrypted value
					is destroyed and any service consuming this row stops
					working immediately.
				</p>
				<p
					style={{
						margin: 0,
						fontSize: '0.85rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					Type{' '}
					<code
						style={{
							background: 'rgba(255,255,255,0.08)',
							padding: '0 0.3rem',
							borderRadius: 4,
						}}>
						{token.token_name}
					</code>{' '}
					to confirm.
				</p>
				<input
					type="text"
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					style={inputStyle}
					autoComplete="off"
					spellCheck={false}
				/>
				{error && (
					<p
						style={{
							color: '#f87171',
							fontSize: '0.85rem',
							margin: 0,
						}}>
						{error}
					</p>
				)}
				<div
					style={{
						display: 'flex',
						justifyContent: 'flex-end',
						gap: '0.5rem',
					}}>
					<button
						type="button"
						onClick={onClose}
						style={secondaryButton}>
						Cancel
					</button>
					<button
						type="button"
						onClick={submit}
						disabled={!match || busy}
						style={dangerButton(match && !busy)}>
						{busy ? (
							<Loader2
								size={14}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						) : null}
						{busy ? 'Deleting…' : 'Delete token'}
					</button>
				</div>
			</div>
		</ModalShell>
	);
}

function Field({
	label,
	hint,
	error,
	control,
}: {
	label: string;
	hint?: string;
	error?: string | null;
	control: React.ReactNode;
}) {
	return (
		<label
			style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
			<span
				style={{
					fontSize: '0.8rem',
					fontWeight: 600,
					color: 'var(--sl-color-white, #fff)',
				}}>
				{label}
			</span>
			{control}
			{hint && !error && (
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					{hint}
				</span>
			)}
			{error && (
				<span style={{ fontSize: '0.75rem', color: '#f87171' }}>
					{error}
				</span>
			)}
		</label>
	);
}

const inputStyle: React.CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	width: '100%',
	boxSizing: 'border-box',
};

const smallButton: React.CSSProperties = {
	alignSelf: 'flex-start',
	display: 'inline-flex',
	alignItems: 'center',
	padding: '0.3rem 0.6rem',
	borderRadius: 6,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
	fontSize: '0.78rem',
};

const secondaryButton: React.CSSProperties = {
	padding: '0.5rem 1rem',
	borderRadius: 8,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
	fontSize: '0.9rem',
};

function primaryButton(enabled: boolean): React.CSSProperties {
	return {
		padding: '0.5rem 1rem',
		borderRadius: 8,
		border: 'none',
		background: enabled ? '#58a6ff' : 'rgba(88,166,255,0.4)',
		color: '#0d1117',
		fontWeight: 600,
		cursor: enabled ? 'pointer' : 'not-allowed',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
	};
}

function dangerButton(enabled: boolean): React.CSSProperties {
	return {
		padding: '0.5rem 1rem',
		borderRadius: 8,
		border: 'none',
		background: enabled ? '#ef4444' : 'rgba(239,68,68,0.4)',
		color: '#fff',
		fontWeight: 600,
		cursor: enabled ? 'pointer' : 'not-allowed',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
	};
}

export const _refreshIcon = RefreshCw;
