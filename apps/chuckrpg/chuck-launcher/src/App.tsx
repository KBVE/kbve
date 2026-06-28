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
						className="ck-btn ck-btn--secondary mt-2.5 w-full px-4 py-2 text-[0.6rem]">
						<RefreshIcon />
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
					className="ck-btn ck-btn--secondary ck-btn--github flex-1 px-3 py-2.5 text-[0.55rem]">
					<GitHubIcon />
					<span className="ck-btn__text">GitHub</span>
				</button>
				<button
					onClick={() => void s.signInWith('discord')}
					disabled={authing}
					className="ck-btn ck-btn--secondary ck-btn--discord flex-1 px-3 py-2.5 text-[0.55rem]">
					<DiscordIcon />
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

function GitHubIcon() {
	return (
		<svg
			className="ck-btn__icon"
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true">
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

function DiscordIcon() {
	return (
		<svg
			className="ck-btn__icon"
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true">
			<path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032c.001.014.01.028.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019c.308-.42.582-.863.818-1.329a.05.05 0 0 0-.01-.059.051.051 0 0 0-.018-.011 8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019c.084-.063.168-.129.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007c.08.066.164.132.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z" />
		</svg>
	);
}

function RefreshIcon() {
	return (
		<svg
			className="ck-btn__icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<path d="M23 4v6h-6M1 20v-6h6" />
			<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
		</svg>
	);
}
