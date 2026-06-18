// Admin vetting queue — pending membership applications with the submitted
// profile draft + approve/reject. Staff-gated by DashboardShell; the backend
// re-checks staff permission too.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	decideApplication,
	fetchAdminApplications,
	fetchTaxonomy,
} from '../api/client';
import type { AdminApplication } from '../api/types';
import { Capability } from '../api/types';
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui';

const GAME_DEV_ID = 1;

function capLabel(caps: number): string {
	return (
		[
			caps & Capability.CAP_TAKER ? 'Taker' : null,
			caps & Capability.CAP_POSTER ? 'Poster' : null,
		]
			.filter(Boolean)
			.join(' + ') || '—'
	);
}

export function VettingView() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({
		queryKey: ['admin-applications'],
		queryFn: fetchAdminApplications,
	});
	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});

	const labelOf = (id: number) =>
		taxData?.taxonomy.find((t) => t.id === id)?.label ?? `#${id}`;

	return (
		<div className="text-zinc-100">
			<h2 className="font-display text-2xl font-bold">Vetting queue</h2>
			<p className="mb-5 text-sm text-zinc-400">
				Review the submitted profile, then approve (grants the requested
				capabilities + publishes the profile) or reject.
			</p>

			{isLoading ? (
				<Spinner label="Loading applications…" />
			) : error ? (
				<ErrorNote error={error} />
			) : data && data.applications.length > 0 ? (
				<div className="grid gap-4">
					{data.applications.map((app) => (
						<ApplicationRow
							key={app.id}
							app={app}
							labelOf={labelOf}
							onDecided={() =>
								queryClient.invalidateQueries({
									queryKey: ['admin-applications'],
								})
							}
						/>
					))}
				</div>
			) : (
				<EmptyState
					title="No pending applications"
					hint="The queue is clear."
				/>
			)}
		</div>
	);
}

function ApplicationRow({
	app,
	labelOf,
	onDecided,
}: {
	app: AdminApplication;
	labelOf: (id: number) => string;
	onDecided: () => void;
}) {
	const [notes, setNotes] = useState('');
	const mutation = useMutation({
		mutationFn: (approve: boolean) =>
			decideApplication(app.id, {
				approve,
				grant_capabilities: app.requested_capabilities,
				notes: notes.trim(),
			}),
		onSuccess: onDecided,
	});

	const d = app.profile_draft ?? {};
	const portfolioLinks = app.portfolio_links ?? [];
	const meta = [
		d.years_experience ? `${d.years_experience} yrs exp` : null,
		d.location || null,
	].filter(Boolean);

	return (
		<div className="panel p-5">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="font-display font-semibold">
						{app.email ?? app.user_id}
					</div>
					{d.headline ? (
						<div className="text-sm text-zinc-300">
							{d.headline}
						</div>
					) : null}
					<div className="mt-0.5 text-xs text-zinc-500">
						Requesting{' '}
						<span className="text-quest-300">
							{capLabel(app.requested_capabilities)}
						</span>
						{meta.length ? ` · ${meta.join(' · ')}` : ''}
					</div>
				</div>
			</div>

			{(d.bio || app.statement) && (
				<p className="mt-3 whitespace-pre-line text-sm text-zinc-300">
					{d.bio || app.statement}
				</p>
			)}

			{d.discipline_ids && d.discipline_ids.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{d.discipline_ids.map((id) => (
						<span
							key={id}
							className="rounded-full border border-quest-600/50 bg-quest-500/10 px-2.5 py-0.5 text-xs text-quest-200">
							{labelOf(id)}
						</span>
					))}
				</div>
			)}

			{d.links && d.links.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
					{d.links.map((l, i) => (
						<a
							key={i}
							href={l.url}
							target="_blank"
							rel="noreferrer"
							className="text-sm text-quest-300 underline hover:text-quest-200">
							{l.kind}
						</a>
					))}
				</div>
			)}

			{portfolioLinks.length > 0 && (
				<ul className="mt-2 space-y-1">
					{portfolioLinks.map((url) => (
						<li key={url}>
							<a
								href={url}
								target="_blank"
								rel="noreferrer"
								className="text-sm text-zinc-400 underline hover:text-zinc-200">
								{url}
							</a>
						</li>
					))}
				</ul>
			)}

			<div className="mt-4 flex flex-col gap-3 border-t border-zinc-800/70 pt-4 sm:flex-row sm:items-center">
				<input
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="Reviewer notes (optional)"
					className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none"
				/>
				<div className="flex gap-2">
					<Button
						variant="outline"
						disabled={mutation.isPending}
						onClick={() => mutation.mutate(false)}>
						Reject
					</Button>
					<Button
						disabled={mutation.isPending}
						onClick={() => mutation.mutate(true)}>
						{mutation.isPending ? 'Saving…' : 'Approve'}
					</Button>
				</div>
			</div>

			{mutation.isError && (
				<p className="mt-2 text-sm text-red-400">
					{String(mutation.error)}
				</p>
			)}
		</div>
	);
}
