import { useEffect, type ReactNode } from 'react';
import { useLauncher } from './store';

function pct(received: number, total: number): number {
	if (!total) return 0;
	return Math.min(100, Math.round((received / total) * 100));
}

export default function App() {
	const s = useLauncher();
	useEffect(() => {
		void s.refresh();
		void s.initAuth();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const latest = s.latest();
	const installing = s.phase === 'installing';
	const launching = s.phase === 'launching';
	const running = s.phase === 'running';
	const loading = s.phase === 'loading';
	const busy = installing || launching || loading;
	const action = !s.installed
		? 'Install'
		: s.needsUpdate()
			? 'Update'
			: 'Play';

	const onClick = () => {
		if (action === 'Play') void s.play();
		else void s.installOrUpdate();
	};

	const progress = pct(s.progress?.received ?? 0, s.progress?.total ?? 0);

	return (
		<>
			<div className="ck-backdrop" aria-hidden="true" />
			<div className="ck-embers" aria-hidden="true" />
			<div className="ck-vignette" aria-hidden="true" />

			<div className="relative z-10 flex min-h-full items-center justify-center p-6">
				<div className="ck-panel w-full max-w-md px-8 py-9">
					<div className="mb-6 text-center">
						<div className="ck-emblem mb-3 text-3xl">&#9876;</div>
						<p className="ck-label mb-3 text-[0.6rem]">
							Open World MMO
						</p>
						<h1 className="ck-title text-3xl">
							Chuck<span className="ck-title-accent">RPG</span>
						</h1>
						<p className="mt-2 text-xs italic text-[rgba(232,220,200,0.45)]">
							{s.platform
								? `Forged for ${s.platform}`
								: 'Detecting your realm…'}
						</p>
					</div>

					<AuthBlock />

					<div className="mb-7 space-y-2.5 text-sm">
						<Row label="Latest build">
							{latest?.user_version
								? `v${latest.user_version}${latest.live ? '' : ' (processing)'}`
								: '—'}
						</Row>
						<Row label="Installed">
							{s.installed?.user_version
								? `v${s.installed.user_version}`
								: 'not installed'}
						</Row>
					</div>

					{installing && (
						<div className="mb-5">
							<div className="ck-progress-track h-2.5 w-full">
								<div
									className="ck-progress-fill"
									style={{ width: `${progress}%` }}
								/>
							</div>
							<p className="ck-label mt-2 text-center text-[0.55rem] text-[var(--ck-firelight-dim)]">
								{progress}% — Forging…
							</p>
						</div>
					)}

					{s.error && (
						<p className="mb-5 rounded border border-[var(--ck-blood)] bg-[rgba(139,32,32,0.12)] px-3 py-2 text-center text-xs text-[#c44040]">
							{s.error}
						</p>
					)}

					<button
						onClick={onClick}
						disabled={
							busy ||
							running ||
							(action !== 'Play' && !latest?.live)
						}
						className="ck-btn ck-btn--primary w-full px-4 py-3.5 text-xs">
						<span className="ck-btn__fill" aria-hidden="true" />
						<span className="ck-btn__text inline-flex items-center gap-2">
							{(installing || launching) && (
								<span className="ck-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--ck-stone)] border-t-transparent" />
							)}
							{running && (
								<span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--ck-forest)] shadow-[0_0_8px_2px_rgba(74,122,90,0.7)]" />
							)}
							{installing
								? 'Forging…'
								: launching
									? 'Entering…'
									: running
										? 'Running'
										: action === 'Play'
											? 'Enter the Realm'
											: action === 'Update'
												? 'Update Realm'
												: 'Claim the Blade'}
						</span>
					</button>

					{launching && (
						<p className="ck-label mt-3 text-center text-[0.55rem] text-[var(--ck-firelight-dim)]">
							Awakening the realm — your window opens shortly
						</p>
					)}

					{running && (
						<p className="ck-label mt-3 text-center text-[0.55rem] text-[var(--ck-firelight-dim)]">
							In the realm — close the game to return
						</p>
					)}

					<button
						onClick={() => void s.refresh()}
						disabled={busy}
						className="ck-btn ck-btn--ghost mt-2.5 w-full px-4 py-2 text-[0.6rem]">
						<span className="ck-btn__text">Refresh</span>
					</button>
				</div>
			</div>
		</>
	);
}

function AuthBlock() {
	const s = useLauncher();
	const authing = s.authPhase === 'authing';

	if (s.authPhase === 'authed' && s.user) {
		const initial = (s.user.name ?? '?').charAt(0).toUpperCase();
		return (
			<div className="mb-6 flex items-center gap-3 rounded border border-[var(--ck-leather)] bg-[rgba(15,14,12,0.4)] px-3 py-2.5">
				{s.user.avatar_url ? (
					<img
						src={s.user.avatar_url}
						alt=""
						className="h-8 w-8 rounded-full border border-[var(--ck-firelight-dim)]"
					/>
				) : (
					<span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ck-firelight-dim)] bg-[var(--ck-stone)] font-[Cinzel] text-sm text-[var(--ck-firelight)]">
						{initial}
					</span>
				)}
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm text-[var(--ck-parchment)]">
						{s.user.name}
					</p>
					<p className="ck-label text-[0.5rem] text-[var(--ck-firelight-dim)]">
						Signed in
					</p>
				</div>
				<button
					onClick={() => void s.signOut()}
					className="ck-btn ck-btn--ghost px-2.5 py-1 text-[0.55rem]">
					<span className="ck-btn__text">Sign out</span>
				</button>
			</div>
		);
	}

	return (
		<div className="mb-6">
			<p className="ck-label mb-2 text-center text-[0.5rem] text-[var(--ck-firelight-dim)]">
				{authing
					? 'Opening portal…'
					: 'Sign in to carry your legend'}
			</p>
			<div className="flex gap-2">
				<button
					onClick={() => void s.signInWith('github')}
					disabled={authing}
					className="ck-btn ck-btn--ghost flex-1 px-3 py-2 text-[0.55rem]">
					<span className="ck-btn__text">GitHub</span>
				</button>
				<button
					onClick={() => void s.signInWith('discord')}
					disabled={authing}
					className="ck-btn ck-btn--ghost flex-1 px-3 py-2 text-[0.55rem]">
					<span className="ck-btn__text">Discord</span>
				</button>
			</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="ck-row flex justify-between pb-1.5">
			<span className="text-[var(--ck-firelight-dim)]">{label}</span>
			<span className="font-medium text-[var(--ck-parchment)]">
				{children}
			</span>
		</div>
	);
}
