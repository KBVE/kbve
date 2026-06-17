import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
	fetchMyApplication,
	fetchVerticals,
	submitApplication,
} from '../api/client';
import type { MembershipApplication } from '../api/types';
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

const CAP_TAKER = 1;
const CAP_POSTER = 2;

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
	// A pending or approved application blocks re-submission; rejected can re-apply.
	if (existing && existing.status !== 2) {
		return <StatusView app={existing} />;
	}

	return (
		<ApplicationForm
			verticals={vertData?.verticals ?? []}
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
						You're vetted — head to your dashboard to set up your
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
	previouslyRejected,
	onSubmitted,
}: {
	verticals: { id: number; label: string; slug: string }[];
	previouslyRejected: boolean;
	onSubmitted: () => void;
}) {
	const [caps, setCaps] = useState(0);
	const [verticalIds, setVerticalIds] = useState<number[]>([]);
	const [statement, setStatement] = useState('');
	const [links, setLinks] = useState<string[]>(['']);

	const mutation = useMutation({
		mutationFn: submitApplication,
		onSuccess: onSubmitted,
	});

	const toggleCap = (bit: number) =>
		setCaps((c) => (c & bit ? c & ~bit : c | bit));
	const toggleVertical = (id: number) =>
		setVerticalIds((v) =>
			v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
		);

	const valid = caps !== 0 && statement.trim().length > 0;
	const submit = () =>
		mutation.mutate({
			requested_capabilities: caps,
			vertical_ids: verticalIds,
			statement: statement.trim(),
			portfolio_links: links.map((l) => l.trim()).filter(Boolean),
		});

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="font-display text-2xl font-bold">
				Apply for membership
			</h1>
			<p className="mt-1 text-sm text-zinc-400">
				{previouslyRejected
					? 'Your last application was declined — you can revise and re-apply.'
					: 'Tell us how you want to use the board. Both sides are vetted.'}
			</p>

			<form
				className="mt-6 space-y-5"
				onSubmit={(e) => {
					e.preventDefault();
					if (valid) submit();
				}}>
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
					<div>
						<span className={label}>Vertical(s)</span>
						<div className="flex flex-wrap gap-2">
							{verticals.map((v) => (
								<button
									key={v.id}
									type="button"
									onClick={() => toggleVertical(v.id)}
									className={`rounded-full border px-3 py-1 text-xs ${
										verticalIds.includes(v.id)
											? 'border-quest-500 bg-quest-500/15 text-quest-200'
											: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
									}`}>
									{v.label}
								</button>
							))}
						</div>
					</div>
				)}

				<div>
					<label className={label}>Statement</label>
					<textarea
						className={`${field} min-h-28`}
						placeholder="What you make, who you've worked with, why you're a fit…"
						value={statement}
						onChange={(e) => setStatement(e.target.value)}
						maxLength={5000}
					/>
				</div>

				<div>
					<span className={label}>Portfolio links</span>
					<div className="space-y-2">
						{links.map((l, i) => (
							<div key={i} className="flex gap-2">
								<input
									className={field}
									type="url"
									placeholder="https://…"
									value={l}
									onChange={(e) =>
										setLinks((arr) =>
											arr.map((x, j) =>
												j === i ? e.target.value : x,
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
						{links.length < 20 && (
							<button
								type="button"
								onClick={() => setLinks((arr) => [...arr, ''])}
								className="text-xs text-quest-300 hover:text-quest-200">
								+ add link
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
