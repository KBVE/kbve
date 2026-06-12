import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	CheckCircle2,
	Copy,
	Eye,
	EyeOff,
	Loader2,
	Shuffle,
} from 'lucide-react';
import { useAgents } from '../context';
import { useStepCardStatus } from '../../dashboard/useStepCardStatus';
import {
	WEBHOOK_TOKEN_NAME,
	WEBHOOK_SERVICE,
	genHex,
	copyToClipboard,
	mutedText,
	primaryBtn,
	secondaryBtn,
	errText,
	inputStyle,
	iconBtn,
	spinStyle,
} from './shared';

export default function Step1Webhook() {
	const agents = useAgents();
	const guilds = useStore(agents.$guilds);
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const tokens = useStore(agents.$tokens);
	const guildId = selectedGuildId ?? '';
	const guild = guilds.find((g) => g.id === selectedGuildId) ?? null;
	const existing = tokens.find((t) => t.service === WEBHOOK_SERVICE) ?? null;

	const draftsMap = useStore(agents.$webhookDrafts);
	const savingMap = useStore(agents.$webhookSavingFor);
	const errorsMap = useStore(agents.$webhookErrors);

	const secret = draftsMap[guildId] ?? null;
	const busy = !!savingMap[guildId];
	const error = errorsMap[guildId] ?? null;

	const [reveal, setReveal] = useState(false);
	const [copied, setCopied] = useState(false);

	const stored = !!existing;

	useEffect(() => {
		setReveal(false);
		setCopied(false);
	}, [guildId]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 2500);
		return () => clearTimeout(t);
	}, [copied]);

	async function generate() {
		agents.setWebhookDraft(guildId, genHex(32));
		setReveal(true);
		setCopied(false);
		agents.clearWebhookError(guildId);
	}

	async function save() {
		if (!secret) return;
		const r = await agents.saveWebhookDraft(
			guildId,
			WEBHOOK_TOKEN_NAME,
			`GitHub webhook HMAC for guild ${guildId}`,
		);
		if (r.ok) setReveal(false);
	}

	async function copy() {
		if (!secret) return;
		const ok = await copyToClipboard(secret);
		setCopied(ok);
	}

	const status = stored ? 'done' : secret ? 'pending' : 'todo';
	const anchor = useStepCardStatus(status);

	if (!guild) return <span ref={anchor} hidden aria-hidden="true" />;

	return (
		<>
			<span ref={anchor} hidden aria-hidden="true" />
			{stored ? (
				<p style={mutedText}>
					<CheckCircle2
						size={14}
						color="#4ade80"
						style={{ verticalAlign: '-2px', marginRight: 6 }}
					/>
					Already stored as{' '}
					<code>
						{WEBHOOK_SERVICE}:{guildId}
					</code>{' '}
					(token <code>{existing!.token_name}</code>). To rotate, use
					the <strong>Rotate HMAC secret</strong> control in Step 2 —
					it regenerates the secret and updates GitHub + the vault in
					one step.
				</p>
			) : (
				<>
					<p style={mutedText}>
						Generate a random ≥32-char HMAC secret. The same value
						goes into the GitHub webhook config in Step 2.
					</p>
					{!secret && (
						<button
							type="button"
							onClick={generate}
							style={primaryBtn}>
							<Shuffle size={14} />
							Generate 32-byte hex secret
						</button>
					)}
					{secret && (
						<>
							<div
								style={{
									display: 'flex',
									alignItems: 'stretch',
									gap: '0.4rem',
								}}>
								<input
									readOnly
									type={reveal ? 'text' : 'password'}
									value={secret}
									style={{
										...inputStyle,
										fontFamily:
											'var(--sl-font-mono, ui-monospace, monospace)',
										flex: 1,
									}}
								/>
								<button
									type="button"
									onClick={() => setReveal((r) => !r)}
									style={iconBtn}
									aria-label={reveal ? 'Hide' : 'Reveal'}>
									{reveal ? (
										<EyeOff size={14} />
									) : (
										<Eye size={14} />
									)}
								</button>
								<button
									type="button"
									onClick={copy}
									style={iconBtn}
									aria-label="Copy">
									<Copy size={14} />
									{copied ? ' Copied' : ''}
								</button>
							</div>
							<div
								style={{
									display: 'flex',
									gap: '0.4rem',
									flexWrap: 'wrap',
								}}>
								<button
									type="button"
									onClick={generate}
									style={secondaryBtn}>
									<Shuffle size={14} />
									Regenerate
								</button>
								<button
									type="button"
									onClick={save}
									disabled={busy}
									title={
										busy
											? 'HMAC save in flight — wait for it to finish.'
											: 'Store the generated HMAC secret as github_webhook in the vault.'
									}
									style={primaryBtn}>
									{busy ? (
										<Loader2 size={14} style={spinStyle} />
									) : (
										<CheckCircle2 size={14} />
									)}
									{busy ? 'Saving…' : 'Save to Vault'}
								</button>
							</div>
						</>
					)}
					{error && <p style={errText}>{error}</p>}
				</>
			)}
		</>
	);
}
