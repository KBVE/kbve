import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	LINK_KINDS,
	hostMessage,
	hostOk,
	profileDraftSchema,
} from '../lib/profileDraft';
import {
	fetchMyApplication,
	fetchTaxonomy,
	fetchVerticals,
	submitApplication,
} from '../api/client';
import type {
	MembershipApplication,
	ProfileDraft,
	TaxonomyItem,
	Vertical,
} from '../api/types';
import { Capability } from '../api/types';
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui';
import {
	fieldCls,
	fieldClsRow,
	labelCls,
	errBorder,
	FieldMessage,
} from '../components/form';
import { useAuth } from '../lib/auth';

const GAME_DEV_ID = 1;
const CAP_TAKER = Capability.CAP_TAKER;
const CAP_POSTER = Capability.CAP_POSTER;

const STATUS_LABEL = ['Pending review', 'Approved', 'Rejected'] as const;

// Empty string is allowed (optional row). Non-empty must be https:// — matches
// the server CHECK (is_valid_profile_links) so the client never sends a URL the
// DB will reject.
const optionalUrl = z
	.string()
	.trim()
	.refine((v) => v === '' || (/^https:\/\//i.test(v) && v.length <= 2048), {
		message: 'Enter a valid https:// URL',
	});

const applicationSchema = z.object({
	caps: z.number().int().min(1, { message: 'Pick at least one' }),
	verticalIds: z.array(z.number()),
	disciplineIds: z.array(z.number()),
	headline: z.string().trim().max(200, { message: 'Max 200 characters' }),
	about: z
		.string()
		.trim()
		.min(1, { message: 'Tell us a bit about yourself' })
		.max(5000, { message: 'Max 5000 characters' }),
	// Kept as a string (number input) so an empty field is valid; range-checked.
	years: z
		.string()
		.refine((v) => v === '' || /^\d{1,3}$/.test(v), {
			message: 'Whole number',
		})
		.refine((v) => v === '' || Number(v) <= 100, { message: 'Max 100' }),
	location: z.string().trim().max(120, { message: 'Max 120 characters' }),
	links: z
		.array(
			z
				.object({ kind: z.enum(LINK_KINDS), url: optionalUrl })
				.superRefine((l, ctx) => {
					const url = l.url.trim();
					if (url && !hostOk(l.kind, url)) {
						ctx.addIssue({
							code: 'custom',
							path: ['url'],
							message: hostMessage(l.kind),
						});
					}
				}),
		)
		.max(10),
	projects: z.array(z.object({ url: optionalUrl })).max(20),
});

type ApplicationValues = z.infer<typeof applicationSchema>;

export function ApplyPage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();

	const { data, isLoading, error } = useQuery({
		queryKey: ['my-application'],
		queryFn: fetchMyApplication,
		enabled: !!user,
	});
	const { data: vertData } = useQuery({
		queryKey: ['verticals', {}],
		queryFn: fetchVerticals,
	});
	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});

	if (!user) {
		return (
			<div className="mx-auto max-w-lg space-y-4">
				<EmptyState
					title="Log in to apply for membership"
					hint="Both sides are vetted — sign in, then submit an application."
				/>
				<div className="text-center">
					<Link
						to="/login"
						className="inline-block rounded-lg bg-quest-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-quest-400">
						Log in
					</Link>
				</div>
			</div>
		);
	}

	if (isLoading) return <Spinner label="Loading your application…" />;
	if (error) return <ErrorNote error={error} />;

	const existing = data?.application ?? null;
	if (existing && existing.status !== 2) {
		return <StatusView app={existing} />;
	}

	return (
		<ApplicationForm
			verticals={vertData?.verticals ?? []}
			disciplines={(taxData?.taxonomy ?? []).filter((t) => t.kind === 1)}
			previouslyRejected={existing?.status === 2}
			onSubmitted={() =>
				queryClient.invalidateQueries({ queryKey: ['my-application'] })
			}
		/>
	);
}

function StatusView({ app }: { app: MembershipApplication }) {
	const tone =
		app.status === 1
			? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
			: 'border-zinc-700 bg-zinc-900/50 text-zinc-300';
	const caps = [
		app.requested_capabilities & CAP_TAKER ? 'Taker' : null,
		app.requested_capabilities & CAP_POSTER ? 'Poster' : null,
	].filter(Boolean);

	return (
		<div className="mx-auto max-w-lg">
			<h1 className="font-display text-2xl font-bold">Membership</h1>
			<div className={`mt-4 rounded-xl border px-5 py-4 ${tone}`}>
				<div className="text-xs uppercase tracking-wide opacity-80">
					Status
				</div>
				<div className="font-display text-lg font-bold">
					{STATUS_LABEL[app.status]}
				</div>
				<p className="mt-2 text-sm">
					Requested: {caps.join(' + ') || '—'}
				</p>
				{app.status === 0 && (
					<p className="mt-2 text-sm text-zinc-400">
						An admin will review your portfolio shortly.
					</p>
				)}
				{app.status === 1 && (
					<p className="mt-2 text-sm">
						You're vetted — head to your dashboard to finish your
						profile.
					</p>
				)}
				{app.review_notes && (
					<p className="mt-3 border-t border-white/10 pt-3 text-sm text-zinc-300">
						<span className="text-zinc-500">Reviewer notes: </span>
						{app.review_notes}
					</p>
				)}
			</div>
		</div>
	);
}

function ApplicationForm({
	verticals,
	disciplines,
	previouslyRejected,
	onSubmitted,
}: {
	verticals: Vertical[];
	disciplines: TaxonomyItem[];
	previouslyRejected: boolean;
	onSubmitted: () => void;
}) {
	const [draftError, setDraftError] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: submitApplication,
		onSuccess: onSubmitted,
	});

	const {
		register,
		handleSubmit,
		control,
		watch,
		setValue,
		formState: { errors, submitCount },
	} = useForm<ApplicationValues>({
		resolver: zodResolver(applicationSchema),
		mode: 'onBlur',
		defaultValues: {
			caps: 0,
			verticalIds: [],
			disciplineIds: [],
			headline: '',
			about: '',
			years: '',
			location: '',
			links: [{ kind: 'github', url: '' }],
			projects: [{ url: '' }],
		},
	});

	const links = useFieldArray({ control, name: 'links' });
	const projects = useFieldArray({ control, name: 'projects' });

	const caps = watch('caps');
	const verticalIds = watch('verticalIds');
	const disciplineIds = watch('disciplineIds');
	const isTaker = (caps & CAP_TAKER) !== 0;

	const toggleCap = (bit: number) =>
		setValue('caps', caps & bit ? caps & ~bit : caps | bit, {
			shouldValidate: true,
			shouldDirty: true,
		});

	const toggleId = (
		name: 'verticalIds' | 'disciplineIds',
		ids: number[],
		id: number,
	) =>
		setValue(
			name,
			ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
			{ shouldDirty: true },
		);

	const onSubmit = (v: ApplicationValues) => {
		const taker = (v.caps & CAP_TAKER) !== 0;
		const draft = {
			headline: v.headline.trim(),
			bio: v.about.trim(),
			years_experience: Number(v.years) || 0,
			location: v.location.trim(),
			links: v.links
				.filter((l) => l.url.trim())
				.map((l) => ({ kind: l.kind, url: l.url.trim() })),
			discipline_ids: taker ? v.disciplineIds : [],
		};

		// Pre-flight against the SQL CHECK mirror so a bad shape surfaces here
		// instead of as a server rejection.
		const parsed = profileDraftSchema.safeParse(draft);
		if (!parsed.success) {
			setDraftError(parsed.error.issues[0]?.message ?? 'Invalid profile');
			return;
		}
		setDraftError(null);

		mutation.mutate({
			requested_capabilities: v.caps,
			vertical_ids: v.verticalIds,
			statement: v.about.trim(),
			portfolio_links: v.projects
				.map((p) => p.url.trim())
				.filter(Boolean),
			profile_draft: parsed.data as ProfileDraft,
		});
	};

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="font-display text-2xl font-bold">
				Apply for membership
			</h1>
			<p className="mt-1 text-sm text-zinc-400">
				{previouslyRejected
					? 'Your last application was declined — revise and re-apply.'
					: "Tell us about yourself — this becomes your public profile once you're approved."}
			</p>

			<form
				className="mt-6 space-y-6"
				onSubmit={handleSubmit(onSubmit)}
				noValidate>
				{/* Capabilities */}
				<div>
					<span className={labelCls}>I want to…</span>
					<div className="flex flex-wrap gap-2">
						{[
							[CAP_TAKER, 'Take work (Taker)'],
							[CAP_POSTER, 'Post work (Poster)'],
						].map(([bit, text]) => (
							<button
								key={bit}
								type="button"
								onClick={() => toggleCap(bit as number)}
								className={`rounded-lg border px-4 py-2 text-sm ${
									caps & (bit as number)
										? 'border-quest-500 bg-quest-500/15 text-quest-200'
										: 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
								}`}>
								{text}
							</button>
						))}
					</div>
					<FieldMessage error={errors.caps} />
				</div>

				{verticals.length > 0 && (
					<ChipGroup
						title="Vertical(s)"
						items={verticals.map((v) => ({
							id: v.id,
							label: v.label,
						}))}
						selected={verticalIds}
						onToggle={(id) =>
							toggleId('verticalIds', verticalIds, id)
						}
					/>
				)}

				{/* Disciplines — takers pick their expertise */}
				{isTaker && disciplines.length > 0 && (
					<ChipGroup
						title="Your disciplines / expertise"
						items={disciplines.map((d) => ({
							id: d.id,
							label: d.label,
						}))}
						selected={disciplineIds}
						onToggle={(id) =>
							toggleId('disciplineIds', disciplineIds, id)
						}
					/>
				)}

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<label className={labelCls}>Headline</label>
						<input
							className={`${fieldCls} ${errBorder(errors.headline)}`}
							placeholder="e.g. Pixel artist & animator — juicy 2D action"
							{...register('headline')}
						/>
						<FieldMessage error={errors.headline} />
					</div>
					<div>
						<label className={labelCls}>Years of experience</label>
						<input
							type="number"
							min={0}
							max={100}
							className={`${fieldCls} ${errBorder(errors.years)}`}
							{...register('years')}
						/>
						<FieldMessage error={errors.years} />
					</div>
					<div>
						<label className={labelCls}>Location</label>
						<input
							className={`${fieldCls} ${errBorder(errors.location)}`}
							placeholder="City, Country"
							{...register('location')}
						/>
						<FieldMessage error={errors.location} />
					</div>
				</div>

				<div>
					<label className={labelCls}>About you</label>
					<textarea
						className={`${fieldCls} min-h-28 ${errBorder(errors.about)}`}
						placeholder="What you make, who you've worked with, what you're great at…"
						{...register('about')}
					/>
					<FieldMessage error={errors.about} />
				</div>

				{/* Structured profile links */}
				<div>
					<span className={labelCls}>Profiles & socials</span>
					<div className="space-y-2">
						{links.fields.map((f, i) => (
							<div key={f.id}>
								<div className="flex gap-2">
									<select
										className={`${fieldClsRow} w-32 shrink-0`}
										{...register(`links.${i}.kind`)}>
										{LINK_KINDS.map((k) => (
											<option key={k} value={k}>
												{k}
											</option>
										))}
									</select>
									<input
										className={`${fieldClsRow} min-w-0 flex-1 ${errBorder(errors.links?.[i]?.url)}`}
										type="url"
										placeholder="https://…"
										{...register(`links.${i}.url`)}
									/>
									{links.fields.length > 1 && (
										<button
											type="button"
											onClick={() => links.remove(i)}
											className="rounded-lg border border-zinc-700 px-3 text-zinc-400 hover:text-zinc-200">
											✕
										</button>
									)}
								</div>
								<FieldMessage error={errors.links?.[i]?.url} />
							</div>
						))}
						{links.fields.length < 10 && (
							<button
								type="button"
								onClick={() =>
									links.append({ kind: 'other', url: '' })
								}
								className="text-xs text-quest-300 hover:text-quest-200">
								+ add link
							</button>
						)}
					</div>
				</div>

				{/* Free-form project / work links */}
				<div>
					<span className={labelCls}>Project / work links</span>
					<div className="space-y-2">
						{projects.fields.map((f, i) => (
							<div key={f.id}>
								<div className="flex gap-2">
									<input
										className={`${fieldClsRow} min-w-0 flex-1 ${errBorder(errors.projects?.[i]?.url)}`}
										type="url"
										placeholder="Link to a shipped project, build, or reel…"
										{...register(`projects.${i}.url`)}
									/>
									{projects.fields.length > 1 && (
										<button
											type="button"
											onClick={() => projects.remove(i)}
											className="rounded-lg border border-zinc-700 px-3 text-zinc-400 hover:text-zinc-200">
											✕
										</button>
									)}
								</div>
								<FieldMessage
									error={errors.projects?.[i]?.url}
								/>
							</div>
						))}
						{projects.fields.length < 20 && (
							<button
								type="button"
								onClick={() => projects.append({ url: '' })}
								className="text-xs text-quest-300 hover:text-quest-200">
								+ add project
							</button>
						)}
					</div>
				</div>

				{submitCount > 0 && Object.keys(errors).length > 0 && (
					<p className="text-sm text-amber-400">
						Some fields need attention:{' '}
						{Object.keys(errors).join(', ')}. Fix the highlighted
						fields above, then submit again.
					</p>
				)}

				{draftError && (
					<p className="text-sm text-amber-400">{draftError}</p>
				)}

				{mutation.isError && (
					<p className="text-sm text-red-400">
						Could not submit: {String(mutation.error)}
					</p>
				)}

				<Button type="submit" disabled={mutation.isPending}>
					{mutation.isPending ? 'Submitting…' : 'Submit application'}
				</Button>
			</form>
		</div>
	);
}

function ChipGroup({
	title,
	items,
	selected,
	onToggle,
}: {
	title: string;
	items: { id: number; label: string }[];
	selected: number[];
	onToggle: (id: number) => void;
}) {
	return (
		<div>
			<span className={labelCls}>{title}</span>
			<div className="flex flex-wrap gap-2">
				{items.map((it) => (
					<button
						key={it.id}
						type="button"
						onClick={() => onToggle(it.id)}
						className={`rounded-full border px-3 py-1 text-xs ${
							selected.includes(it.id)
								? 'border-quest-500 bg-quest-500/15 text-quest-200'
								: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
						}`}>
						{it.label}
					</button>
				))}
			</div>
		</div>
	);
}
