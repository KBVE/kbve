import { useState, useCallback, type FormEvent } from 'react';
import { CATEGORIES } from '@/lib/servers/types';
import { submitServer } from '@/lib/servers/discordshEdge';
import { useHCaptcha } from '@/lib/servers/useHCaptcha';

const slVar = (name: string, fallback: string) =>
	`var(--sl-color-${name}, ${fallback})`;

const inputStyle: React.CSSProperties = {
	width: '100%',
	padding: '0.625rem 0.75rem',
	borderRadius: '0.5rem',
	border: `1px solid var(--sl-color-gray-5, #374151)`,
	backgroundColor: 'var(--sl-color-gray-6, #111827)',
	color: 'var(--sl-color-text, #e5e7eb)',
	fontSize: '0.875rem',
	boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: '0.8125rem',
	fontWeight: 600,
	color: 'var(--sl-color-text, #e5e7eb)',
	marginBottom: '0.375rem',
};

const hintStyle: React.CSSProperties = {
	fontSize: '0.75rem',
	color: 'var(--sl-color-gray-3, #9ca3af)',
	marginTop: '0.25rem',
};

export function ReactSubmitForm() {
	const [serverId, setServerId] = useState('');
	const [name, setName] = useState('');
	const [summary, setSummary] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [description, setDescription] = useState('');
	const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
	const [tagsInput, setTagsInput] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const {
		containerRef: captchaRef,
		execute: executeCaptcha,
		reset: resetCaptcha,
	} = useHCaptcha();

	const toggleCategory = useCallback((catValue: number) => {
		setSelectedCategories((prev) => {
			if (prev.includes(catValue)) {
				return prev.filter((c) => c !== catValue);
			}
			if (prev.length >= 3) return prev;
			return [...prev, catValue];
		});
	}, []);

	const handleSubmit = useCallback(
		async (e: FormEvent) => {
			e.preventDefault();
			setResult(null);
			setSubmitting(true);

			try {
				const captchaToken = await executeCaptcha();

				const tags = tagsInput
					.split(',')
					.map((t) => t.trim().toLowerCase())
					.filter((t) => t.length > 0)
					.slice(0, 10);

				const res = await submitServer({
					server_id: serverId.trim(),
					name: name.trim(),
					summary: summary.trim(),
					invite_code: inviteCode.trim(),
					captcha_token: captchaToken,
					description: description.trim() || undefined,
					categories:
						selectedCategories.length > 0
							? selectedCategories
							: undefined,
					tags: tags.length > 0 ? tags : undefined,
				});

				setResult({
					success: res.success,
					message:
						res.message ??
						(res.success
							? 'Server submitted for review!'
							: 'Submission failed.'),
				});

				if (res.success) {
					setServerId('');
					setName('');
					setSummary('');
					setInviteCode('');
					setDescription('');
					setSelectedCategories([]);
					setTagsInput('');
				}
			} catch (err: unknown) {
				const msg =
					err instanceof Error ? err.message : 'Unexpected error';
				setResult({ success: false, message: msg });
			} finally {
				setSubmitting(false);
				resetCaptcha();
			}
		},
		[
			serverId,
			name,
			summary,
			inviteCode,
			description,
			selectedCategories,
			tagsInput,
			executeCaptcha,
			resetCaptcha,
		],
	);

	return (
		<form
			onSubmit={handleSubmit}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '1.25rem',
			}}>
			{/* Invisible hCaptcha */}
			<div ref={captchaRef} style={{ display: 'none' }} />

			{/* Result message */}
			{result && (
				<div
					style={{
						padding: '0.75rem 1rem',
						borderRadius: '0.5rem',
						border: `1px solid ${result.success ? '#22c55e' : '#ef4444'}`,
						backgroundColor: result.success
							? 'rgba(34, 197, 94, 0.1)'
							: 'rgba(239, 68, 68, 0.1)',
						color: result.success ? '#4ade80' : '#f87171',
						fontSize: '0.875rem',
					}}>
					{result.message}
				</div>
			)}

			{/* Server ID */}
			<div>
				<label style={labelStyle}>Discord Server ID</label>
				<input
					type="text"
					value={serverId}
					onChange={(e) => setServerId(e.target.value)}
					placeholder="e.g. 123456789012345678"
					required
					pattern="\d{17,20}"
					style={inputStyle}
				/>
				<p style={hintStyle}>
					Right-click your server name in Discord, select "Copy Server
					ID". Must be 17-20 digits.
				</p>
			</div>

			{/* Server Name */}
			<div>
				<label style={labelStyle}>Server Name</label>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="My Awesome Server"
					required
					maxLength={100}
					style={inputStyle}
				/>
			</div>

			{/* Summary */}
			<div>
				<label style={labelStyle}>Summary</label>
				<input
					type="text"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					placeholder="A short description of your server"
					required
					maxLength={200}
					style={inputStyle}
				/>
				<p style={hintStyle}>{summary.length}/200 characters</p>
			</div>

			{/* Invite Code */}
			<div>
				<label style={labelStyle}>Invite Code</label>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
					}}>
					<span
						style={{
							color: slVar('gray-3', '#9ca3af'),
							fontSize: '0.875rem',
							whiteSpace: 'nowrap',
						}}>
						discord.gg/
					</span>
					<input
						type="text"
						value={inviteCode}
						onChange={(e) => setInviteCode(e.target.value)}
						placeholder="your-invite"
						required
						pattern="[a-zA-Z0-9_-]{2,32}"
						maxLength={32}
						style={inputStyle}
					/>
				</div>
				<p style={hintStyle}>
					Create a permanent invite link in your server settings.
				</p>
			</div>

			{/* Description (optional) */}
			<div>
				<label style={labelStyle}>
					Description{' '}
					<span
						style={{
							fontWeight: 400,
							color: slVar('gray-3', '#9ca3af'),
						}}>
						(optional)
					</span>
				</label>
				<textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Tell people more about your server..."
					maxLength={2000}
					rows={4}
					style={{ ...inputStyle, resize: 'vertical' }}
				/>
				<p style={hintStyle}>{description.length}/2000 characters</p>
			</div>

			{/* Categories */}
			<div>
				<label style={labelStyle}>
					Categories{' '}
					<span
						style={{
							fontWeight: 400,
							color: slVar('gray-3', '#9ca3af'),
						}}>
						(up to 3)
					</span>
				</label>
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: '0.5rem',
					}}>
					{CATEGORIES.map((cat, idx) => {
						const catValue = idx + 1;
						const selected = selectedCategories.includes(catValue);
						return (
							<button
								key={cat.id}
								type="button"
								onClick={() => toggleCategory(catValue)}
								style={{
									padding: '0.375rem 0.75rem',
									borderRadius: '9999px',
									border: `1px solid ${selected ? 'var(--sl-color-accent, #8b5cf6)' : 'var(--sl-color-gray-5, #374151)'}`,
									backgroundColor: selected
										? 'var(--sl-color-accent-low, #1e1033)'
										: 'transparent',
									color: selected
										? 'var(--sl-color-accent, #8b5cf6)'
										: 'var(--sl-color-gray-3, #9ca3af)',
									fontSize: '0.8125rem',
									cursor: 'pointer',
									transition: 'all 0.15s',
								}}>
								{cat.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Tags (optional) */}
			<div>
				<label style={labelStyle}>
					Tags{' '}
					<span
						style={{
							fontWeight: 400,
							color: slVar('gray-3', '#9ca3af'),
						}}>
						(optional, comma-separated, max 10)
					</span>
				</label>
				<input
					type="text"
					value={tagsInput}
					onChange={(e) => setTagsInput(e.target.value)}
					placeholder="e.g. competitive, friendly, 18+"
					style={inputStyle}
				/>
			</div>

			{/* Submit button */}
			<button
				type="submit"
				disabled={submitting}
				style={{
					padding: '0.75rem 1.5rem',
					borderRadius: '0.5rem',
					border: 'none',
					backgroundColor: 'var(--sl-color-accent, #8b5cf6)',
					color: '#fff',
					fontSize: '0.9375rem',
					fontWeight: 600,
					cursor: submitting ? 'default' : 'pointer',
					opacity: submitting ? 0.6 : 1,
					transition: 'opacity 0.15s',
				}}>
				{submitting ? 'Submitting...' : 'Submit Server'}
			</button>
		</form>
	);
}
