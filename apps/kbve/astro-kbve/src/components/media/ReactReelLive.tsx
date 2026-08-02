import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { DroidEvents, type ReelStreamPayload } from '@kbve/droid';
import { homeService } from '@/components/dashboard/homeService';
import ReactReelDiagnostics from './ReactReelDiagnostics';
import {
	$reelList,
	$reelListError,
	$reelState,
	$reelError,
	$reelNotice,
	$reelStatus,
	refreshReelList,
	ReelPlayer,
	type ReelTorrent,
} from './reelService';

const POLL_MS = 15000;
// After a reel errors for good, wait this long before rolling to the next so a
// transient blip isn't skipped past instantly.
const ERROR_ADVANCE_MS = 4000;
// If every reel in the loop errors in a row, cool off before refreshing the
// list and trying the channel again from the top.
const LOOP_COOLDOWN_MS = 30000;

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
	const status = useStore($reelStatus);
	const isStaff = useStore(homeService.$isStaff);
	const authState = useStore(homeService.$authState);

	const videoRef = useRef<HTMLVideoElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const [player] = useState(() => new ReelPlayer());
	const [started, setStarted] = useState(false);
	const [nowId, setNowId] = useState<string | null>(null);
	const [theater, setTheater] = useState(false);
	const [muted, setMuted] = useState(true);

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
			const v = videoRef.current;
			if (v) {
				v.muted = muted;
				void player.start(v, id);
			}
		},
		[player, muted],
	);

	// Advance past the current reel. Wraps to the head so the channel never runs
	// dry while at least one reel is still seeding.
	const advance = useCallback(() => {
		if (!queue.length) return;
		const at = queue.findIndex((t) => t.id === nowId);
		const next = queue[(at + 1) % queue.length];
		if (next) tuneTo(next.id);
	}, [queue, nowId, tuneTo]);

	// Keep the latest advance/queue-length reachable from the event handler
	// without re-subscribing to the bus on every queue change.
	const advanceRef = useRef(advance);
	const queueLenRef = useRef(queue.length);
	const errorStreak = useRef(0);
	const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		advanceRef.current = advance;
		queueLenRef.current = queue.length;
	}, [advance, queue.length]);

	// Self-healing loop: the player reports every playback transition on the
	// droid bus. When a reel errors for good, roll on by itself instead of
	// stranding on "Off air"; a clean start resets the streak. If the whole loop
	// errors in a row, cool off, refresh the list, and try again from the top.
	useEffect(() => {
		if (!started) return;
		const handler = (p: ReelStreamPayload) => {
			if (p.stage === 'playing') {
				errorStreak.current = 0;
				return;
			}
			if (p.stage !== 'error' || !p.fatal) return;
			if (loopTimer.current) clearTimeout(loopTimer.current);
			const len = Math.max(1, queueLenRef.current);
			if (errorStreak.current < len) {
				errorStreak.current += 1;
				loopTimer.current = setTimeout(
					() => advanceRef.current(),
					ERROR_ADVANCE_MS,
				);
			} else {
				errorStreak.current = 0;
				loopTimer.current = setTimeout(() => {
					void refreshReelList();
					advanceRef.current();
				}, LOOP_COOLDOWN_MS);
			}
		};
		DroidEvents.on('reel-stream', handler);
		return () => {
			DroidEvents.off('reel-stream', handler);
			if (loopTimer.current) {
				clearTimeout(loopTimer.current);
				loopTimer.current = null;
			}
		};
	}, [started]);

	const start = useCallback(() => {
		const first = queue[0];
		if (!first) return;
		setStarted(true);
		setTheater(true);
		tuneTo(first.id);
	}, [queue, tuneTo]);

	// Twitch-style: the moment content is airable the channel tunes itself in —
	// no click. Autoplay only survives muted, so we start silent and let the
	// viewer unmute (that gesture also lets us go fullscreen).
	useEffect(() => {
		if (!isStaff || started) return;
		if (!queue.length) return;
		start();
	}, [isStaff, started, queue, start]);

	// Unmuting is the first real user gesture, so ride it into fullscreen for a
	// hands-off, lean-back stream.
	const unmute = useCallback(() => {
		setMuted(false);
		const v = videoRef.current;
		if (v) {
			v.muted = false;
			void v.play().catch(() => undefined);
		}
		const stage = stageRef.current;
		if (stage && !document.fullscreenElement) {
			void stage.requestFullscreen?.().catch(() => setTheater(true));
		}
	}, []);

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
		document.body.classList.add('reel-theater-active');
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
			document.body.classList.remove('reel-theater-active');
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
				<div className="reel-player__stage" ref={stageRef}>
					<video
						ref={videoRef}
						controls
						playsInline
						className="reel-player__video"
						onEnded={advance}
					/>
					{playing && muted && (
						<button
							type="button"
							className="reel-live__unmute"
							onClick={unmute}>
							🔊 Tap to unmute
						</button>
					)}
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
											? 'Tuning in…'
											: 'Standby — waiting for content. The channel starts on its own when a reel is ready.'}
									</p>
								</>
							) : (
								<>
									<p>
										{state === 'error'
											? 'Off air — skipping to next…'
											: state === 'reconnecting'
												? 'Reconnecting…'
												: 'Tuning in…'}
									</p>
									{now && (
										<p className="reel-player__meta">
											{now.name}
										</p>
									)}
									{state === 'reconnecting' && (
										<p className="reel-player__meta">
											{status?.message ??
												'Stream interrupted'}
											{status?.attempt && status?.max
												? ` · attempt ${status.attempt}/${status.max}`
												: ''}
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
					<ReactReelDiagnostics />
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
