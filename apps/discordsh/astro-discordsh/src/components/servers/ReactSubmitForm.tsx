import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CATEGORIES } from '@/lib/servers/types';
import { SubmitServerRequestSchema } from '@kbve/codegen/discordsh-schema';
import { submitServer } from '@/lib/servers/discordshEdge';
import { useHCaptcha } from '@/lib/servers/useHCaptcha';
import { z } from 'zod';

// Client-side form schema — extends the proto-generated schema with the tags
// input as a raw string (split into array on submit)
const FormSchema = SubmitServerRequestSchema.omit({
	tags: true,
	member_count: true,
}).extend({
	tags_input: z
		.string()
		.max(500, 'Tags input too long')
		.optional()
		.default(''),
});

type FormValues = z.infer<typeof FormSchema>;

export function ReactSubmitForm() {
	const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const {
		register,
		handleSubmit,
		watch,
		reset,
		formState: { errors },
	} = useForm<FormValues>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			server_id: '',
			name: '',
			summary: '',
			invite_code: '',
			description: '',
			tags_input: '',
		},
	});

	const {
		containerRef: captchaRef,
		execute: executeCaptcha,
		reset: resetCaptcha,
	} = useHCaptcha();

	const summary = watch('summary') ?? '';
	const description = watch('description') ?? '';

	const toggleCategory = useCallback((catValue: number) => {
		setSelectedCategories((prev) => {
			if (prev.includes(catValue)) {
				return prev.filter((c) => c !== catValue);
			}
			if (prev.length >= 3) return prev;
			return [...prev, catValue];
		});
	}, []);

	const onSubmit = useCallback(
		async (data: FormValues) => {
			setResult(null);
			setSubmitting(true);

			try {
				const captchaToken = await executeCaptcha();

				const tags = (data.tags_input ?? '')
					.split(',')
					.map((t) => t.trim().toLowerCase())
					.filter((t) => t.length > 0)
					.slice(0, 10);

				const res = await submitServer({
					server_id: data.server_id.trim(),
					name: data.name.trim(),
					summary: data.summary.trim(),
					invite_code: data.invite_code.trim(),
					captcha_token: captchaToken,
					description: data.description?.trim() || undefined,
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
					reset();
					setSelectedCategories([]);
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
		[selectedCategories, executeCaptcha, resetCaptcha, reset],
	);

	return (
		<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
			{/* Invisible hCaptcha */}
			<div ref={captchaRef} className="hidden" />

			{/* Result message */}
			{result && (
				<div
					className={`sf-result ${result.success ? 'sf-result-ok' : 'sf-result-err'}`}>
					{result.message}
				</div>
			)}

			{/* Server ID */}
			<div>
				<label className="sf-label">Discord Server ID</label>
				<input
					type="text"
					{...register('server_id')}
					placeholder="e.g. 123456789012345678"
					className="sf-input"
				/>
				{errors.server_id && (
					<p className="sf-error">{errors.server_id.message}</p>
				)}
				<p className="sf-hint">
					Right-click your server name in Discord, select &quot;Copy
					Server ID&quot;. Must be 17-20 digits.
				</p>
			</div>

			{/* Server Name */}
			<div>
				<label className="sf-label">Server Name</label>
				<input
					type="text"
					{...register('name')}
					placeholder="My Awesome Server"
					maxLength={100}
					className="sf-input"
				/>
				{errors.name && (
					<p className="sf-error">{errors.name.message}</p>
				)}
			</div>

			{/* Summary */}
			<div>
				<label className="sf-label">Summary</label>
				<input
					type="text"
					{...register('summary')}
					placeholder="A short description of your server"
					maxLength={200}
					className="sf-input"
				/>
				{errors.summary && (
					<p className="sf-error">{errors.summary.message}</p>
				)}
				<p className="sf-hint">{summary.length}/200 characters</p>
			</div>

			{/* Invite Code */}
			<div>
				<label className="sf-label">Invite Code</label>
				<div className="flex items-center gap-2">
					<span className="sf-hint whitespace-nowrap text-sm">
						discord.gg/
					</span>
					<input
						type="text"
						{...register('invite_code')}
						placeholder="your-invite"
						maxLength={32}
						className="sf-input"
					/>
				</div>
				{errors.invite_code && (
					<p className="sf-error">{errors.invite_code.message}</p>
				)}
				<p className="sf-hint">
					Create a permanent invite link in your server settings.
				</p>
			</div>

			{/* Description (optional) */}
			<div>
				<label className="sf-label">
					Description{' '}
					<span className="sf-hint font-normal">(optional)</span>
				</label>
				<textarea
					{...register('description')}
					placeholder="Tell people more about your server..."
					maxLength={2000}
					rows={4}
					className="sf-input resize-y"
				/>
				{errors.description && (
					<p className="sf-error">{errors.description.message}</p>
				)}
				<p className="sf-hint">{description.length}/2000 characters</p>
			</div>

			{/* Categories */}
			<div>
				<label className="sf-label">
					Categories{' '}
					<span className="sf-hint font-normal">(up to 3)</span>
				</label>
				<div className="flex flex-wrap gap-2">
					{CATEGORIES.map((cat, idx) => {
						const catValue = idx + 1;
						const selected = selectedCategories.includes(catValue);
						return (
							<button
								key={cat.id}
								type="button"
								onClick={() => toggleCategory(catValue)}
								className={`sg-pill ${selected ? 'sg-pill-active' : 'sg-pill-inactive'}`}>
								{cat.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Tags (optional) */}
			<div>
				<label className="sf-label">
					Tags{' '}
					<span className="sf-hint font-normal">
						(optional, comma-separated, max 10)
					</span>
				</label>
				<input
					type="text"
					{...register('tags_input')}
					placeholder="e.g. competitive, friendly, 18+"
					className="sf-input"
				/>
			</div>

			{/* Submit button */}
			<button type="submit" disabled={submitting} className="sf-submit">
				{submitting ? 'Submitting...' : 'Submit Server'}
			</button>
		</form>
	);
}
