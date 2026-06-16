import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { createGig, fetchTaxonomy } from '../api/client';
import type { BudgetType, CreateGigInput, LocationPref } from '../api/types';
import { Button, EmptyState } from '../components/ui';
import { useAuth } from '../lib/auth';

const GAME_DEV_ID = 1;

const field =
	'w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none';
const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400';

export function PostGigPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});

	const [form, setForm] = useState({
		title: '',
		summary: '',
		description: '',
		budget_type: 2 as BudgetType,
		budget_min: '',
		budget_max: '',
		location_pref: 0 as LocationPref,
		deadline: '',
	});
	const [tagIds, setTagIds] = useState<number[]>([]);

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
		setTagIds((ids) =>
			ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
		);

	const valid =
		form.title.trim().length > 0 &&
		form.summary.trim().length > 0 &&
		Number(form.budget_min) >= 0;

	const submit = () => {
		mutation.mutate({
			title: form.title.trim(),
			summary: form.summary.trim(),
			description: form.description.trim(),
			budget_type: form.budget_type,
			budget_min: Math.round(Number(form.budget_min || 0) * 100),
			budget_max: Math.round(
				Number(form.budget_max || form.budget_min || 0) * 100,
			),
			currency: 'USD',
			location_pref: form.location_pref,
			deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
			tag_ids: tagIds,
		});
	};

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="font-display text-2xl font-bold">Post a gig</h1>
			<p className="mt-1 text-sm text-zinc-400">
				Describe the work. Vetted talent will apply with their portfolio.
			</p>

			<form
				className="mt-6 space-y-5"
				onSubmit={(e) => {
					e.preventDefault();
					if (valid) submit();
				}}>
				<div>
					<label className={label}>Title</label>
					<input
						className={field}
						value={form.title}
						onChange={(e) => setForm({ ...form, title: e.target.value })}
						placeholder="e.g. Pixel-art character set for a roguelite"
						maxLength={120}
					/>
				</div>

				<div>
					<label className={label}>Summary</label>
					<input
						className={field}
						value={form.summary}
						onChange={(e) => setForm({ ...form, summary: e.target.value })}
						placeholder="One line that sells the gig"
						maxLength={200}
					/>
				</div>

				<div>
					<label className={label}>Description (markdown)</label>
					<textarea
						className={`${field} min-h-32`}
						value={form.description}
						onChange={(e) => setForm({ ...form, description: e.target.value })}
						placeholder="Scope, references, deliverables…"
					/>
				</div>

				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div className="col-span-2 sm:col-span-2">
						<label className={label}>Budget type</label>
						<select
							className={field}
							value={form.budget_type}
							onChange={(e) =>
								setForm({
									...form,
									budget_type: Number(e.target.value) as BudgetType,
								})
							}>
							<option value={1}>Fixed</option>
							<option value={2}>Range</option>
							<option value={3}>Hourly</option>
							<option value={0}>Undisclosed</option>
						</select>
					</div>
					<div>
						<label className={label}>Min ($)</label>
						<input
							type="number"
							min={0}
							className={field}
							value={form.budget_min}
							onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
						/>
					</div>
					<div>
						<label className={label}>Max ($)</label>
						<input
							type="number"
							min={0}
							className={field}
							value={form.budget_max}
							onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
						/>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={label}>Location</label>
						<select
							className={field}
							value={form.location_pref}
							onChange={(e) =>
								setForm({
									...form,
									location_pref: Number(e.target.value) as LocationPref,
								})
							}>
							<option value={0}>Remote</option>
							<option value={1}>On-site</option>
							<option value={2}>Hybrid</option>
						</select>
					</div>
					<div>
						<label className={label}>Deadline (optional)</label>
						<input
							type="date"
							className={field}
							value={form.deadline}
							onChange={(e) => setForm({ ...form, deadline: e.target.value })}
						/>
					</div>
				</div>

				{groups.map(([title, kind]) => {
					const items = tax.filter((t) => t.kind === kind);
					if (!items.length) return null;
					return (
						<div key={kind}>
							<label className={label}>{title}</label>
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
					<Button type="submit" disabled={!valid || mutation.isPending}>
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
