import { useGameSelector } from '../store/GameStoreContext';

export function ConnectionOverlay() {
	const connection = useGameSelector((s) => s.connection);

	if (connection.status === 'ready') return null;

	const isPending =
		connection.status === 'connecting' ||
		connection.status === 'connected' ||
		connection.status === 'slow';

	return (
		<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
			<div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-amber-200/10 bg-black/70 p-6 text-center shadow-2xl shadow-black/60 backdrop-blur-xl">
				{isPending ? (
					<>
						<span
							className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400"
							aria-hidden="true"
						/>
						<p className="text-sm font-semibold text-amber-200">
							Linking to Cloud City…
						</p>
						<p className="mt-2 text-xs text-stone-400">
							{connection.status === 'slow'
								? 'This is taking longer than usual. The realm may be waking up — hang tight.'
								: 'Establishing a secure connection to the game server.'}
						</p>
					</>
				) : (
					<>
						<svg
							className="mx-auto mb-4 h-8 w-8 text-red-400"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true">
							<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
						<p className="text-sm font-semibold text-red-300">
							{connection.status === 'rejected'
								? 'Connection rejected'
								: 'Connection lost'}
						</p>
						<p className="mt-2 text-xs text-stone-400">
							{connection.detail ??
								'The link to the game server failed. The world may be offline or unreachable.'}
						</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="mt-4 w-full rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
							Retry connection
						</button>
					</>
				)}
			</div>
		</div>
	);
}
