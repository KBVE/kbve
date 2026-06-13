import { useGameSelector } from '../store/GameStoreContext';

interface RejectInfo {
	title: string;
	message: string;
	button: string;
}

function describeReject(
	reason: string | undefined,
	fallback: string,
): RejectInfo {
	const r = reason ?? '';
	if (/protocol mismatch/i.test(r)) {
		return {
			title: 'Update required',
			message:
				'Your game client is out of date. Refresh the page to load the newest version of CryptoThrone.',
			button: 'Refresh client',
		};
	}
	if (/session expired/i.test(r)) {
		return {
			title: 'Session expired',
			message:
				'Your sign-in session ran out while you were away. Sign in again to re-enter the world.',
			button: 'Sign in again',
		};
	}
	if (/signature invalid|auth rejected|invalid token/i.test(r)) {
		return {
			title: 'Sign-in rejected',
			message:
				'The server could not verify your session. Sign out and back in, then try again.',
			button: 'Sign in again',
		};
	}
	if (/match full/i.test(r)) {
		return {
			title: 'World is full',
			message: `Every seat in the realm is taken right now (${r.match(/\d+/)?.[0] ?? 'max'} players). Try again in a few minutes.`,
			button: 'Try again',
		};
	}
	if (/username required/i.test(r)) {
		return {
			title: 'Username needed',
			message:
				'Your KBVE account has no username yet. Set one up and the gates will open.',
			button: 'Set username',
		};
	}
	return {
		title: 'Connection rejected',
		message: r || fallback,
		button: 'Retry connection',
	};
}

export function ConnectionOverlay() {
	const connection = useGameSelector((s) => s.connection);

	if (connection.status === 'ready') return null;

	const isPending =
		connection.status === 'connecting' ||
		connection.status === 'connected' ||
		connection.status === 'reconnecting' ||
		connection.status === 'slow';

	const reject =
		connection.status === 'rejected'
			? describeReject(
					connection.reason,
					connection.detail ?? 'The server refused the connection.',
				)
			: null;

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
							{connection.status === 'reconnecting'
								? 'Reconnecting…'
								: 'Linking to Cloud City…'}
						</p>
						<p className="mt-2 text-xs text-stone-400">
							{connection.status === 'reconnecting'
								? (connection.detail ??
									'The link dropped — re-establishing your place in the world.')
								: connection.status === 'slow'
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
							{reject ? reject.title : 'Connection lost'}
						</p>
						<p className="mt-2 text-xs text-stone-400">
							{reject
								? reject.message
								: (connection.detail ??
									'The link to the game server failed. The world may be offline or unreachable.')}
						</p>
						{reject?.title === 'Connection rejected' &&
							connection.reason && (
								<p className="mt-2 break-words font-mono text-[0.65rem] text-stone-600">
									{connection.reason}
								</p>
							)}
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="mt-4 w-full rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
							{reject ? reject.button : 'Retry connection'}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
