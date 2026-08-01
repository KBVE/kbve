import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { homeService } from '@/components/dashboard/homeService';
import {
	$reelList,
	$reelListError,
	$reelState,
	$reelError,
	$reelNotice,
	refreshReelList,
	ReelPlayer,
	type ReelTorrent,
} from './reelService';

const POLL_MS = 15000;

function playable(t: ReelTorrent): boolean {
	if (t.state !== 'Seeding') return false;
	if (t.transcode === 'Failed' || t.hls === 'Failed') return false;
	return true;
}

function airTime(t: ReelTorrent): number {
	return t.completed_at ?? t.last_access ?? 0;
}

// The channel is ordered by completion: whatever finished first airs first, and
// a reel that finishes while the channel is running joins the tail of the queue.
function buildQueue(list: ReelTorrent[]): ReelTorrent[] {
	return list.filter(playable).sort((a, b) => airTime(a) - airTime(b));
}

function fmtSize(bytes: number): string {
	if (!bytes) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let v = bytes;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function ReactReelLive() {
	const list = useStore($reelList);
	const listError = useStore($reelListError);
	const state = useStore($reelState);
	const error = useStore($reelError);
	const notice = useStore($reelNotice);
	const isStaff = useStore(homeService.$isStaff);
	const authState = useStore(homeService.$authState);

	const videoRef = useRef<HTMLVideoElement>(null);
	const [player] = useState(() => new ReelPlayer());
	const [started, setStarted] = useState(false);
	const [nowId, setNowId] = useState<string | null>(null);
	const [theater, setTheater] = useState(false);

	const queue = useMemo(() => buildQueue(list), [list]);
	const nowIndex = queue.findIndex((t) => t.id === nowId);
	const now = nowIndex >= 0 ? queue[nowIndex] : null;
	const upNext = nowIndex >= 0 ? queue.slice(nowIndex + 1) : queue;

	useEffect(() => {
		void homeService.initAuth();
	}, []);

	useEffect(() => {
		if (isStaff) void refreshReelList();
	}, [isStaff]);

	useEffect(() => {
		if (!isStaff) return;
		const timer = setInterval(() => void refreshReelList(), POLL_MS);
		return () => clearInterval(timer);
	}, [isStaff]);

	useEffect(() => {
		return () => player.stop();
	}, [player]);

	const tuneTo = useCallback(
		(id: string) => {
			setNowId(id);
			if (videoRef.current) void player.start(videoRef.current, id);
		},
		[player],
	);

	// Advance past the current reel. Wraps to the head so the channel never runs
	// dry while at least one reel is still seeding.
	const advance = useCallback(() => {
		if (!queue.length) return;
		const at = queue.findIndex((t) => t.id === nowId);
		const next = queue[(at + 1) % queue.length];
		if (next) tuneTo(next.id);
	}, [queue, nowId, tuneTo]);

	const start = useCallback(() => {
		const first = queue[0];
		if (!first) return;
		setStarted(true);
		tuneTo(first.id);
	}, [queue, tuneTo]);

	// A reel that vanishes mid-run (reaped, deleted, failed) shouldn't strand the
	// channel — roll on to whatever is still airable.
	useEffect(() => {
		if (!started || !nowId) return;
		if (queue.some((t) => t.id === nowId)) return;
		const first = queue[0];
		if (first) tuneTo(first.id);
		else setNowId(null);
	}, [started, nowId, queue, tuneTo]);

	// Once the channel is running, a reel finishing its download joins the queue
	// on its own; if nothing was airing we pick it up immediately.
	useEffect(() => {
		if (!started || nowId) return;
		const first = queue[0];
		if (first) tuneTo(first.id);
	}, [started, nowId, queue, tuneTo]);

	useEffect(() => {
		if (!theater) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setTheater(false);
		};
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
		};
	}, [theater]);

	const playing = state === 'raw' || state === 'hls';

	if (!isStaff) {
		return (
			<div className="reel-live__gate">
				<p>
					{authState === 'loading' || authState === 'authenticated'
						? 'Checking access…'
						: 'Sign in with a staff account to watch the channel.'}
				</p>
			</div>
		);
	}

	return (
		<div className={`reel-live${theater ? ' reel-live--theater' : ''}`}>
			<div className="reel-live__stage-wrap">
				<div className="reel-player__stage">
					<video
						ref={videoRef}
						controls
						playsInline
						className="reel-player__video"
						onEnded={advance}
					/>
					{started && (
						<button
							type="button"
							className="reel-player__theater-toggle"
							aria-pressed={theater}
							title={
								theater ? 'Exit theater (Esc)' : 'Theater mode'
							}
							onClick={() => setTheater((v) => !v)}>
							{theater ? '✕ Exit' : '⛶ Theater'}
						</button>
					)}
					{!playing && (
						<div className="reel-player__overlay">
							{!started ? (
								<>
									<p>KBVE Channel</p>
									<p className="reel-player__meta">
										{queue.length
											? `${queue.length} reel${queue.length === 1 ? '' : 's'} queued`
											: 'nothing ready to air yet'}
									</p>
									<button
										type="button"
										className="reel-live__start"
										disabled={!queue.length}
										onClick={start}>
										▶ Start channel
									</button>
								</>
							) : (
								<>
									<p>
										{state === 'error'
											? 'Off air'
											: 'Tuning in…'}
									</p>
									{now && (
										<p className="reel-player__meta">
											{now.name}
										</p>
									)}
									{state === 'error' && error && (
										<p className="reel-player__error">
											{error}
										</p>
									)}
									{state === 'error' && (
										<button
											type="button"
											className="reel-live__start"
											onClick={advance}>
											Skip to next
										</button>
									)}
								</>
							)}
						</div>
					)}
				</div>
				{notice && <p className="reel-player__notice">{notice}</p>}
			</div>

			<aside className="reel-live__rail">
				<div className="reel-live__now">
					<span className="reel-live__eyebrow">
						<span className="bento-live-dot" aria-hidden="true" />
						On air
					</span>
					<p className="reel-live__now-title">
						{now?.name ?? 'Nothing airing'}
					</p>
					{now && (
						<p className="reel-live__now-meta">
							{fmtSize(now.size)}
							{now.hls === 'Ready' || now.hls === 'Live'
								? ' · HLS'
								: ' · MP4'}
						</p>
					)}
					<div className="reel-live__actions">
						<button
							type="button"
							onClick={advance}
							disabled={queue.length < 2}>
							Skip ▶▶
						</button>
						<a href="/media/reel/">Open in player</a>
					</div>
				</div>

				<div className="reel-live__queue">
					<span className="reel-live__eyebrow">
						Up next · {upNext.length}
					</span>
					{listError && (
						<p className="reel-live__error">{listError}</p>
					)}
					{!upNext.length && !listError && (
						<p className="reel-live__empty">
							Queue is empty. Finished reels land here
							automatically.
						</p>
					)}
					<ul>
						{upNext.map((t) => (
							<li key={t.id}>
								<button
									type="button"
									onClick={() => {
										setStarted(true);
										tuneTo(t.id);
									}}>
									<span className="reel-live__q-title">
										{t.name || t.id}
									</span>
									<span className="reel-live__q-meta">
										{fmtSize(t.size)}
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			</aside>
		</div>
	);
}
