import {
	KBVE_DISCORD_URL,
	KBVE_FEEDBACK_URL,
	onExternalClick,
} from '../../../lib/kbve-links';

export function KbveCommunityCta() {
	return (
		<div className="mt-5 border-t border-amber-200/10 pt-4">
			<p className="text-xs text-stone-400">
				Enjoying CryptoThrone? Join the KBVE community.
			</p>
			<div className="mt-3 flex flex-col gap-2">
				<a
					href={KBVE_DISCORD_URL}
					target="_blank"
					rel="noopener noreferrer"
					onClick={onExternalClick(KBVE_DISCORD_URL)}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70">
					<svg
						className="h-4 w-4"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true">
						<path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.074.074 0 0 0-.079.037c-.34.6-.717 1.385-.98 2.003a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.997-2.003.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 5.677 4.37a.07.07 0 0 0-.032.027C3.04 8.26 2.31 12.057 2.65 15.807a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-4.337-.838-8.104-3.549-11.41a.06.06 0 0 0-.031-.028zM8.02 13.524c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
					</svg>
					Join our Discord
				</a>
				<a
					href={KBVE_FEEDBACK_URL}
					target="_blank"
					rel="noopener noreferrer"
					onClick={onExternalClick(KBVE_FEEDBACK_URL)}
					className="text-xs text-amber-300/80 underline-offset-2 transition hover:text-amber-200 hover:underline">
					Share feedback
				</a>
			</div>
		</div>
	);
}
