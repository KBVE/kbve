import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createGig, fetchTaxonomy } from '../api/client';
import type { BudgetType, CreateGigInput, LocationPref } from '../api/types';
import { Button, EmptyState } from '../components/ui';
import {
	fieldCls,
	labelCls,
	errBorder,
	FieldMessage,
} from '../components/form';
import { useAuth } from '../lib/auth';

const GAME_DEV_ID = 1;

// Money fields are <input type=number> -> string in form state; allow empty,
// otherwise require a non-negative number.
const money = z.string().refine((v) => v === '' || Number(v) >= 0, {
	message: 'Must be 0 or more',
});

const postGigSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1, { message: 'Give the gig a title' })
			.max(120, { message: 'Max 120 characters' }),
		summary: z
			.string()
			.trim()
			.min(1, { message: 'Add a one-line summary' })
			.max(200, { message: 'Max 200 characters' }),
		description: z.string().trim(),
		budget_type: z.number().int(),
		budget_min: money,
		budget_max: money,
		location_pref: z.number().int(),
		deadline: z.string(),
		tagIds: z.array(z.number()),
	})
	.superRefine((v, ctx) => {
		if (
			v.budget_min !== '' &&
			v.budget_max !== '' &&
			Number(v.budget_max) < Number(v.budget_min)
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['budget_max'],
				message: 'Max must be ≥ min',
			});
		}
	});

type PostGigValues = z.infer<typeof postGigSchema>;

export function PostGigPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<PostGigValues>({
		resolver: zodResolver(postGigSchema),
		mode: 'onBlur',
		defaultValues: {
			title: '',
			summary: '',
			description: '',
			budget_type: 2,
			budget_min: '',
			budget_max: '',
			location_pref: 0,
			deadline: '',
			tagIds: [],
		},
	});

	const tagIds = watch('tagIds');

	const mutation = useMutation({
		mutationFn: (input: CreateGigInput) => createGig(input),
		onSuccess: (gig) => {
			queryClient.invalidateQueries({ queryKey: ['gigs'] });
			navigate({ to: '/gigs/$gigId', params: { gigId: gig.id } });
		},
	});

	if (!user) {
		return (
			<div className="mx-auto max-w-lg space-y-4">
				<EmptyState
					title="Log in to post a gig"
					hint="Browsing is open to everyone — sign in when you're ready to hire."
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

	if (!user.can_post) {
		return (
			<div className="mx-auto max-w-lg">
				<EmptyState
					title="Poster access required"
					hint="Your account isn’t approved as a poster yet."
				/>
			</div>
		);
	}

	const tax = taxData?.taxonomy ?? [];
	const groups: [string, number][] = [
		['Discipline', 1],
		['Engine / Tool', 2],
		['Skill', 3],
	];

	const toggle = (id: number) =>
		setValue(
			'tagIds',
			tagIds.includes(id)
				? tagIds.filter((x) => x !== id)
				: [...tagIds, id],
			{ shouldDirty: true },
		);

	const onSubmit = (v: PostGigValues) => {
		mutation.mutate({
			title: v.title.trim(),
			summary: v.summary.trim(),
			description: v.description.trim(),
			budget_type: v.budget_type as BudgetType,
			budget_min: Math.round(Number(v.budget_min || 0) * 100),
			budget_max: Math.round(
				Number(v.budget_max || v.budget_min || 0) * 100,
			),
			currency: 'USD',
			location_pref: v.location_pref as LocationPref,
			deadline: v.deadline ? new Date(v.deadline).toISOString() : null,
			tag_ids: v.tagIds,
		});
	};

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="font-display text-2xl font-bold">Post a gig</h1>
			<p className="mt-1 text-sm text-zinc-400">
				Describe the work. Vetted talent will apply with their
				portfolio.
			</p>

			<form
				className="mt-6 space-y-5"
				onSubmit={handleSubmit(onSubmit)}
				noValidate>
				<div>
					<label className={labelCls}>Title</label>
					<input
						className={`${fieldCls} ${errBorder(errors.title)}`}
						placeholder="e.g. Pixel-art character set for a roguelite"
						maxLength={120}
						{...register('title')}
					/>
					<FieldMessage error={errors.title} />
				</div>

				<div>
					<label className={labelCls}>Summary</label>
					<input
						className={`${fieldCls} ${errBorder(errors.summary)}`}
						placeholder="One line that sells the gig"
						maxLength={200}
						{...register('summary')}
					/>
					<FieldMessage error={errors.summary} />
				</div>

				<div>
					<label className={labelCls}>Description (markdown)</label>
					<textarea
						className={`${fieldCls} min-h-32`}
						placeholder="Scope, references, deliverables…"
						{...register('description')}
					/>
				</div>

				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div className="col-span-2 sm:col-span-2">
						<label className={labelCls}>Budget type</label>
						<select
							className={fieldCls}
							{...register('budget_type', {
								valueAsNumber: true,
							})}>
							<option value={1}>Fixed</option>
							<option value={2}>Range</option>
							<option value={3}>Hourly</option>
							<option value={0}>Undisclosed</option>
						</select>
					</div>
					<div>
						<label className={labelCls}>Min ($)</label>
						<input
							type="number"
							min={0}
							className={`${fieldCls} ${errBorder(errors.budget_min)}`}
							{...register('budget_min')}
						/>
						<FieldMessage error={errors.budget_min} />
					</div>
					<div>
						<label className={labelCls}>Max ($)</label>
						<input
							type="number"
							min={0}
							className={`${fieldCls} ${errBorder(errors.budget_max)}`}
							{...register('budget_max')}
						/>
						<FieldMessage error={errors.budget_max} />
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={labelCls}>Location</label>
						<select
							className={fieldCls}
							{...register('location_pref', {
								valueAsNumber: true,
							})}>
							<option value={0}>Remote</option>
							<option value={1}>On-site</option>
							<option value={2}>Hybrid</option>
						</select>
					</div>
					<div>
						<label className={labelCls}>Deadline (optional)</label>
						<input
							type="date"
							className={fieldCls}
							{...register('deadline')}
						/>
					</div>
				</div>

				{groups.map(([title, kind]) => {
					const items = tax.filter((t) => t.kind === kind);
					if (!items.length) return null;
					return (
						<div key={kind}>
							<label className={labelCls}>{title}</label>
							<div className="flex flex-wrap gap-1.5">
								{items.map((t) => {
									const active = tagIds.includes(t.id);
									return (
										<button
											key={t.id}
											type="button"
											onClick={() => toggle(t.id)}
											className={`rounded-full border px-2.5 py-0.5 text-xs ${
												active
													? 'border-quest-500 bg-quest-500/15 text-quest-200'
													: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
											}`}>
											{t.label}
										</button>
									);
								})}
							</div>
						</div>
					);
				})}

				{mutation.isError && (
					<p className="text-sm text-red-400">
						Could not post: {String(mutation.error)}
					</p>
				)}

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" disabled={mutation.isPending}>
						{mutation.isPending ? 'Posting…' : 'Publish gig'}
					</Button>
					<span className="text-xs text-zinc-500">
						Goes live immediately (mock).
					</span>
				</div>
			</form>
		</div>
	);
}
