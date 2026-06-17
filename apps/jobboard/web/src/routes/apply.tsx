import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
	fetchMyApplication,
	fetchTaxonomy,
	fetchVerticals,
	submitApplication,
} from '../api/client';
import type {
	LinkKind,
	MembershipApplication,
	ProfileLink,
	TaxonomyItem,
	Vertical,
} from '../api/types';
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

const GAME_DEV_ID = 1;
const CAP_TAKER = 1;
const CAP_POSTER = 2;

const LINK_KINDS: LinkKind[] = [
	'github',
	'linkedin',
	'website',
	'x',
	'itch',
	'artstation',
	'other',
];

const field =
	'w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none';
const label =
	'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400';

const STATUS_LABEL = ['Pending review', 'Approved', 'Rejected'] as const;

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
	const [caps, setCaps] = useState(0);
	const [verticalIds, setVerticalIds] = useState<number[]>([]);
	const [disciplineIds, setDisciplineIds] = useState<number[]>([]);
	const [headline, setHeadline] = useState('');
	const [about, setAbout] = useState('');
	const [years, setYears] = useState('');
	const [location, setLocation] = useState('');
	const [links, setLinks] = useState<ProfileLink[]>([
		{ kind: 'github', url: '' },
	]);
	const [projects, setProjects] = useState<string[]>(['']);

	const mutation = useMutation({
		mutationFn: submitApplication,
		onSuccess: onSubmitted,
	});

	const toggle = (
		setter: React.Dispatch<React.SetStateAction<number[]>>,
		id: number,
	) =>
		setter((arr) =>
			arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
		);
	const toggleCap = (bit: number) =>
		setCaps((c) => (c & bit ? c & ~bit : c | bit));

	const isTaker = (caps & CAP_TAKER) !== 0;
	const valid = caps !== 0 && about.trim().length > 0;

	const submit = () =>
		mutation.mutate({
			requested_capabilities: caps,
			vertical_ids: verticalIds,
			statement: about.trim(),
			portfolio_links: projects.map((p) => p.trim()).filter(Boolean),
			profile_draft: {
				headline: headline.trim(),
				bio: about.trim(),
				years_experience: Number(years) || 0,
				location: location.trim(),
				links: links
					.filter((l) => l.url.trim())
					.map((l) => ({ kind: l.kind, url: l.url.trim() })),
				discipline_ids: isTaker ? disciplineIds : [],
			},
		});

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
				onSubmit={(e) => {
					e.preventDefault();
					if (valid) submit();
				}}>
				{/* Capabilities */}
				<div>
					<span className={label}>I want to…</span>
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
				</div>

				{verticals.length > 0 && (
					<ChipGroup
						title="Vertical(s)"
						items={verticals.map((v) => ({
							id: v.id,
							label: v.label,
						}))}
						selected={verticalIds}
						onToggle={(id) => toggle(setVerticalIds, id)}
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
						onToggle={(id) => toggle(setDisciplineIds, id)}
					/>
				)}

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<label className={label}>Headline</label>
						<input
							className={field}
							placeholder="e.g. Pixel artist & animator — juicy 2D action"
							value={headline}
							onChange={(e) => setHeadline(e.target.value)}
							maxLength={200}
						/>
					</div>
					<div>
						<label className={label}>Years of experience</label>
						<input
							type="number"
							min={0}
							max={100}
							className={field}
							value={years}
							onChange={(e) => setYears(e.target.value)}
						/>
					</div>
					<div>
						<label className={label}>Location</label>
						<input
							className={field}
							placeholder="City, Country"
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							maxLength={120}
						/>
					</div>
				</div>

				<div>
					<label className={label}>About you</label>
					<textarea
						className={`${field} min-h-28`}
						placeholder="What you make, who you've worked with, what you're great at…"
						value={about}
						onChange={(e) => setAbout(e.target.value)}
						maxLength={5000}
					/>
				</div>

				{/* Structured profile links */}
				<div>
					<span className={label}>Profiles & socials</span>
					<div className="space-y-2">
						{links.map((l, i) => (
							<div key={i} className="flex gap-2">
								<select
									className={`${field} w-36 shrink-0`}
									value={l.kind}
									onChange={(e) =>
										setLinks((arr) =>
											arr.map((x, j) =>
												j === i
													? {
															...x,
															kind: e.target
																.value as LinkKind,
														}
													: x,
											),
										)
									}>
									{LINK_KINDS.map((k) => (
										<option key={k} value={k}>
											{k}
										</option>
									))}
								</select>
								<input
									className={field}
									type="url"
									placeholder="https://…"
									value={l.url}
									onChange={(e) =>
										setLinks((arr) =>
											arr.map((x, j) =>
												j === i
													? {
															...x,
															url: e.target.value,
														}
													: x,
											),
										)
									}
								/>
								{links.length > 1 && (
									<button
										type="button"
										onClick={() =>
											setLinks((arr) =>
												arr.filter((_, j) => j !== i),
											)
										}
										className="rounded-lg border border-zinc-700 px-3 text-zinc-400 hover:text-zinc-200">
										✕
									</button>
								)}
							</div>
						))}
						{links.length < 10 && (
							<button
								type="button"
								onClick={() =>
									setLinks((arr) => [
										...arr,
										{ kind: 'other', url: '' },
									])
								}
								className="text-xs text-quest-300 hover:text-quest-200">
								+ add link
							</button>
						)}
					</div>
				</div>

				{/* Free-form project / work links */}
				<div>
					<span className={label}>Project / work links</span>
					<div className="space-y-2">
						{projects.map((p, i) => (
							<div key={i} className="flex gap-2">
								<input
									className={field}
									type="url"
									placeholder="Link to a shipped project, build, or reel…"
									value={p}
									onChange={(e) =>
										setProjects((arr) =>
											arr.map((x, j) =>
												j === i ? e.target.value : x,
											),
										)
									}
								/>
								{projects.length > 1 && (
									<button
										type="button"
										onClick={() =>
											setProjects((arr) =>
												arr.filter((_, j) => j !== i),
											)
										}
										className="rounded-lg border border-zinc-700 px-3 text-zinc-400 hover:text-zinc-200">
										✕
									</button>
								)}
							</div>
						))}
						{projects.length < 20 && (
							<button
								type="button"
								onClick={() =>
									setProjects((arr) => [...arr, ''])
								}
								className="text-xs text-quest-300 hover:text-quest-200">
								+ add project
							</button>
						)}
					</div>
				</div>

				{mutation.isError && (
					<p className="text-sm text-red-400">
						Could not submit: {String(mutation.error)}
					</p>
				)}

				<Button type="submit" disabled={!valid || mutation.isPending}>
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
			<span className={label}>{title}</span>
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
