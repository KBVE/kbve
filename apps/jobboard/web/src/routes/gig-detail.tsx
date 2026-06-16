import { Fragment, type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { applyToGig, fetchGig } from '../api/client';
import type { ApplyInput, Gig } from '../api/types';
import { Avatar, Button, ErrorNote, Spinner, TagRow } from '../components/ui';
import { formatBudget, LOCATION_LABELS, relativeTime } from '../lib/format';
import { useAuth } from '../lib/auth';

const routeApi = getRouteApi('/gigs/$gigId');

export function GigDetailPage() {
	const { gigId } = routeApi.useParams();
	const { data: gig, isLoading, error } = useQuery({
		queryKey: ['gig', gigId],
		queryFn: () => fetchGig(gigId),
	});

	if (isLoading) return <Spinner label="Loading gig…" />;
	if (error) return <ErrorNote error={error} />;
	if (!gig) return null;

	const tags = [...gig.disciplines, ...gig.tools, ...gig.skills];
	const deadline = gig.deadline
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
				Date.parse(gig.deadline),
			)
		: 'Flexible';

	return (
		<div className="mx-auto max-w-5xl">
			<Link
				to="/gigs"
				className="text-sm text-zinc-400 hover:text-quest-300">
				← All gigs
			</Link>

			<div className="mt-4 grid gap-8 lg:grid-cols-[1fr_18rem]">
				<article>
					<h1 className="font-display text-3xl font-bold leading-tight">
						{gig.title}
					</h1>
					<p className="mt-2 text-lg text-zinc-300">{gig.summary}</p>

					{gig.poster && (
						<div className="mt-4 flex items-center gap-3">
							<Avatar
								src={gig.poster.avatar_url}
								alt={gig.poster.org_name}
								size={36}
							/>
							<div className="text-sm">
								<div className="font-medium text-zinc-200">
									{gig.poster.org_name}
								</div>
								<div className="text-zinc-500">
									Posted by {gig.poster.display_name} ·{' '}
									{relativeTime(gig.published_at)}
								</div>
							</div>
						</div>
					)}

					<div className="mt-6">
						<TagRow items={tags} />
					</div>

					<div className="prose-invert mt-8 space-y-4 leading-relaxed text-zinc-300">
						<Markdown text={gig.description} />
					</div>
				</article>

				<aside className="lg:sticky lg:top-6 lg:self-start">
					<div className="panel space-y-4 p-5">
						<div>
							<div className="text-xs uppercase tracking-wide text-zinc-500">
								Budget
							</div>
							<div className="font-display text-2xl font-bold text-loot-400">
								{formatBudget(gig)}
							</div>
						</div>
						<Meta label="Location" value={LOCATION_LABELS[gig.location_pref]} />
						<Meta label="Deadline" value={deadline} />
						<Meta label="Applicants" value={String(gig.applicant_count)} />

						<ApplyBox gig={gig} />
					</div>
				</aside>
			</div>
		</div>
	);
}

function ApplyBox({ gig }: { gig: Gig }) {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [cover, setCover] = useState('');
	const [rate, setRate] = useState('');

	const mutation = useMutation({
		mutationFn: (input: ApplyInput) => applyToGig(gig.id, input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['gig', gig.id] });
			queryClient.invalidateQueries({ queryKey: ['gigs'] });
		},
	});

	if (!user?.can_take) {
		return (
			<div className="space-y-2">
				<Button className="w-full" disabled>
					Apply to this gig
				</Button>
				<p className="text-center text-xs text-zinc-500">
					Vetted takers only. In dev, switch role to “taker” or “both” to apply.
				</p>
			</div>
		);
	}

	if (mutation.isSuccess) {
		return (
			<div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-center text-sm text-emerald-300">
				✓ Application sent
			</div>
		);
	}

	if (!open) {
		return (
			<>
				<Button className="w-full" onClick={() => setOpen(true)}>
					Apply to this gig
				</Button>
				<p className="text-center text-xs text-zinc-500">
					Off-platform payment in v1
				</p>
			</>
		);
	}

	const inputCls =
		'w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none';

	return (
		<form
			className="space-y-3"
			onSubmit={(e) => {
				e.preventDefault();
				if (cover.trim())
					mutation.mutate({
						cover_message: cover.trim(),
						proposed_rate: Math.round(Number(rate || 0) * 100),
						proposed_rate_type: gig.budget_type,
					});
			}}>
			<textarea
				className={`${inputCls} min-h-24`}
				placeholder="Why you're a fit — link the relevant work."
				value={cover}
				onChange={(e) => setCover(e.target.value)}
			/>
			<input
				type="number"
				min={0}
				className={inputCls}
				placeholder="Proposed rate ($)"
				value={rate}
				onChange={(e) => setRate(e.target.value)}
			/>
			<Button
				type="submit"
				className="w-full"
				disabled={!cover.trim() || mutation.isPending}>
				{mutation.isPending ? 'Sending…' : 'Send application'}
			</Button>
		</form>
	);
}

function Meta({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between border-t border-zinc-800/70 pt-3 text-sm">
			<span className="text-zinc-500">{label}</span>
			<span className="font-medium text-zinc-200">{value}</span>
		</div>
	);
}

// Minimal, safe inline markdown: paragraphs split on blank lines; **bold** and
// *italic* spans. No HTML injection — we build React nodes, never dangerouslySet.
function Markdown({ text }: { text: string }) {
	const paragraphs = text.trim().split(/\n{2,}/);
	return (
		<>
			{paragraphs.map((p, i) => (
				<p key={i}>{inline(p)}</p>
			))}
		</>
	);
}

function inline(text: string): ReactNode[] {
	const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
	return tokens.map((tok, i) => {
		if (tok.startsWith('**') && tok.endsWith('**')) {
			return (
				<strong key={i} className="font-semibold text-zinc-100">
					{tok.slice(2, -2)}
				</strong>
			);
		}
		if (tok.startsWith('*') && tok.endsWith('*')) {
			return <em key={i}>{tok.slice(1, -1)}</em>;
		}
		return <Fragment key={i}>{tok}</Fragment>;
	});
}
