// Admin vetting queue — pending membership applications with approve/reject.
// Staff-gated by DashboardShell; the backend re-checks staff permission too.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideApplication, fetchAdminApplications } from '../api/client';
import type { AdminApplication } from '../api/types';
import { Button, EmptyState, ErrorNote, Spinner } from '../components/ui';

const CAP_TAKER = 1;
const CAP_POSTER = 2;

function capLabel(caps: number): string {
	const parts = [
		caps & CAP_TAKER ? 'Taker' : null,
		caps & CAP_POSTER ? 'Poster' : null,
	].filter(Boolean);
	return parts.join(' + ') || '—';
}

export function VettingView() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({
		queryKey: ['admin-applications'],
		queryFn: fetchAdminApplications,
	});

	return (
		<div className="text-zinc-100">
			<h2 className="font-display text-2xl font-bold">Vetting queue</h2>
			<p className="mb-5 text-sm text-zinc-400">
				Approve or reject membership applications. Approving grants the
				requested capabilities (creates the talent/client profile).
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
	onDecided,
}: {
	app: AdminApplication;
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

	return (
		<div className="panel p-5">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="font-display font-semibold">
						{app.email ?? app.user_id}
					</div>
					<div className="mt-0.5 text-xs text-zinc-500">
						Requesting:{' '}
						<span className="text-quest-300">
							{capLabel(app.requested_capabilities)}
						</span>{' '}
						· {app.vertical_ids.length} vertical
						{app.vertical_ids.length === 1 ? '' : 's'}
					</div>
				</div>
			</div>

			{app.statement && (
				<p className="mt-3 whitespace-pre-line text-sm text-zinc-300">
					{app.statement}
				</p>
			)}

			{app.portfolio_links.length > 0 && (
				<ul className="mt-3 space-y-1">
					{app.portfolio_links.map((url) => (
						<li key={url}>
							<a
								href={url}
								target="_blank"
								rel="noreferrer"
								className="text-sm text-quest-300 underline hover:text-quest-200">
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
