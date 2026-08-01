import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { homeService } from '@/components/dashboard/homeService';
import {
	$reelList,
	$reelListError,
	$reelListLoading,
	$reelLive,
	$reelHealth,
	$reelSelectedId,
	selectReel,
	addTorrent,
	deleteTorrent,
	startTranscode,
	refreshReelList,
	formatEta,
	formatSpeed,
	downloadEtaSecs,
	type ReelTorrent,
	type ReelLive,
} from './reelService';

const STATE_BADGE: Record<string, string> = {
	Leeching: 'reel-console__badge--leeching',
	Seeding: 'reel-console__badge--seeding',
	Reaped: 'reel-console__badge--reaped',
	Failed: 'reel-console__badge--failed',
};

const PHASE_LABEL: Record<string, string> = {
	'resolving-metadata': 'resolving metadata',
	connecting: 'connecting to peers',
	downloading: 'downloading',
	moving: 'moving to library',
	ready: 'ready',
	transcoding: 'transcoding',
	'streaming-hls': 'streaming (HLS)',
	failed: 'failed',
	reaped: 'reaped',
};

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

interface BarModel {
	variant: 'download' | 'transcode' | 'hls';
	pct: number | null; // null → indeterminate
	primary: string;
	secondary?: string;
}

function joinDot(parts: (string | null | undefined)[]): string | undefined {
	const kept = parts.filter((p): p is string => !!p);
	return kept.length ? kept.join(' · ') : undefined;
}

function rowProgress(t: ReelTorrent, live: ReelLive | undefined): BarModel | null {
	if (t.state === 'Leeching') {
		if (live && live.total_bytes > 0) {
			const pct = Math.min(
				100,
				Math.floor((live.progress_bytes / live.total_bytes) * 100),
			);
			const eta = downloadEtaSecs(
				live.progress_bytes,
				live.total_bytes,
				live.download_mbps,
			);
			return {
				variant: 'download',
				pct,
				primary: `${pct}% · ${fmtSize(live.progress_bytes)} / ${fmtSize(live.total_bytes)}`,
				secondary: joinDot([
					live.download_mbps
						? `${live.download_mbps.toFixed(1)} MiB/s`
						: null,
					`${live.peers_live} peer${live.peers_live === 1 ? '' : 's'}`,
					eta != null ? formatEta(eta) : null,
				]),
			};
		}
		const seen = live?.peers_seen ?? 0;
		return {
			variant: 'download',
			pct: null,
			primary: seen > 0 ? 'resolving metadata' : 'searching for peers…',
			secondary: seen > 0 ? `${seen} seen` : undefined,
		};
	}
	if (t.state === 'Seeding') {
		if (t.transcode === 'Remuxing' || t.transcode === 'Encoding') {
			const p = t.transcode_progress;
			const pct = p?.pct ?? 0;
			return {
				variant: 'transcode',
				pct,
				primary: `transcoding ${pct}%`,
				secondary: joinDot([
					formatSpeed(p?.speed),
					p?.eta_secs != null ? formatEta(p.eta_secs) : null,
				]),
			};
		}
		if (t.hls === 'Starting') {
			return { variant: 'hls', pct: null, primary: 'preparing HLS…' };
		}
	}
	return null;
}

function idleText(t: ReelTorrent, live: ReelLive | undefined): string {
	if (t.state === 'Seeding' && live && live.upload_mbps) {
		return `seeding · ↑ ${live.upload_mbps.toFixed(1)} MiB/s · ${live.peers_live} peer${live.peers_live === 1 ? '' : 's'}`;
	}
	if (t.state === 'Seeding') return `ready · ${fmtSize(t.size)}`;
	return fmtSize(t.size);
}

function ProgressBar({ model }: { model: BarModel }) {
	const indeterminate = model.pct == null;
	return (
		<div className={`reel-bar reel-bar--${model.variant}`}>
			<div
				className={`reel-bar__track${indeterminate ? ' reel-bar__track--indeterminate' : ''}`}
				role="progressbar"
				aria-label={model.primary}
				aria-valuemin={0}
				aria-valuemax={100}
				{...(indeterminate
					? {}
					: { 'aria-valuenow': model.pct as number })}>
				<div
					className="reel-bar__fill"
					style={
						indeterminate ? undefined : { width: `${model.pct}%` }
					}
				/>
			</div>
			<div className="reel-bar__meta">
				<span className="reel-bar__primary">{model.primary}</span>
				{model.secondary && (
					<span className="reel-bar__secondary">
						{model.secondary}
					</span>
				)}
			</div>
		</div>
	);
}

export default function ReactReelConsole() {
	const list = useStore($reelList);
	const listError = useStore($reelListError);
	const loading = useStore($reelListLoading);
	const live = useStore($reelLive);
	const health = useStore($reelHealth);
	const selectedId = useStore($reelSelectedId);
	const isStaff = useStore(homeService.$isStaff);
	const authState = useStore(homeService.$authState);

	const [source, setSource] = useState('');
	const [adding, setAdding] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	useEffect(() => {
		void homeService.initAuth();
	}, []);

	useEffect(() => {
		if (isStaff) void refreshReelList();
	}, [isStaff]);

	useEffect(() => {
		if (!isStaff) return;
		const active = list.some(
			(t) =>
				t.state === 'Leeching' ||
				t.transcode === 'Pending' ||
				t.transcode === 'Remuxing' ||
				t.transcode === 'Encoding' ||
				t.hls === 'Starting' ||
				t.hls === 'Live',
		);
		if (!active) return;
		const timer = setInterval(() => void refreshReelList(), 4000);
		return () => clearInterval(timer);
	}, [isStaff, list]);

	const add = useCallback(async () => {
		const src = source.trim();
		if (!src) return;
		setAdding(true);
		setActionError(null);
		try {
			await addTorrent(src);
			setSource('');
			await refreshReelList();
		} catch (e) {
			setActionError(e instanceof Error ? e.message : 'add failed');
		} finally {
			setAdding(false);
		}
	}, [source]);

	const remove = useCallback(async (t: ReelTorrent) => {
		if (!confirm(`Delete "${t.name || t.id}"? This purges its cache.`))
			return;
		setBusyId(t.id);
		setActionError(null);
		try {
			await deleteTorrent(t.id);
			await refreshReelList();
		} catch (e) {
			setActionError(e instanceof Error ? e.message : 'delete failed');
		} finally {
			setBusyId(null);
		}
	}, []);

	const transcode = useCallback(async (t: ReelTorrent) => {
		setBusyId(t.id);
		setActionError(null);
		try {
			await startTranscode(t.id);
			await refreshReelList();
		} catch (e) {
			setActionError(e instanceof Error ? e.message : 'transcode failed');
		} finally {
			setBusyId(null);
		}
	}, []);

	if (!isStaff) {
		return (
			<div className="reel-console reel-console--gated">
				<p className="reel-console__gate">
					{authState === 'loading' || authState === 'authenticated'
						? 'Checking access…'
						: 'Reel management is restricted to KBVE staff. Sign in with a staff account to add, transcode, or remove reels.'}
				</p>
			</div>
		);
	}

	return (
		<div className="reel-console">
			<div className="reel-console__header">
				<h3>Reel manager</h3>
				<button
					type="button"
					className="reel-console__refresh"
					disabled={loading}
					onClick={() => void refreshReelList()}>
					{loading ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>

			{health && (
				<p className="reel-console__health">
					<span
						className={
							health.vpn_ok
								? 'reel-console__health-ok'
								: 'reel-console__health-bad'
						}>
						{health.vpn_ok ? '● VPN ok' : '● VPN down'}
					</span>
					<span>{health.trackers} trackers</span>
					<span
						className={
							health.inbound_ready
								? 'reel-console__health-ok'
								: undefined
						}>
						{health.inbound_ready
							? `● inbound :${health.forwarded_port}`
							: '○ outbound-only'}
					</span>
					<span>
						{health.counts.seeding} seeding · {health.counts.leeching}{' '}
						leeching · {health.counts.failed} failed
					</span>
				</p>
			)}

			<form
				className="reel-console__add"
				onSubmit={(e) => {
					e.preventDefault();
					void add();
				}}>
				<input
					type="text"
					value={source}
					placeholder="magnet:?xt=… or https://…/file.torrent"
					onChange={(e) => setSource(e.target.value)}
					disabled={adding}
				/>
				<button type="submit" disabled={adding || !source.trim()}>
					{adding ? 'Adding…' : 'Add reel'}
				</button>
			</form>

			{(actionError || listError) && (
				<p className="reel-console__error">
					{actionError ?? listError}
				</p>
			)}

			<ul className="reel-console__list">
				{list.length === 0 && !loading && (
					<li className="reel-console__empty">No reels yet.</li>
				)}
				{list.map((t) => {
					const playable =
						t.state === 'Seeding' || t.state === 'Leeching';
					return (
						<li key={t.id} className="reel-console__row">
							<div className="reel-console__meta">
								<span className="reel-console__name">
									{t.name || t.id}
								</span>
								<span className="reel-console__sub">
									<span
										className={`reel-console__badge ${
											STATE_BADGE[t.state] ?? ''
										}`}>
										{t.phase
											? (PHASE_LABEL[t.phase] ?? t.phase)
											: t.state}
									</span>
								</span>
								{(() => {
									const model = rowProgress(t, live[t.id]);
									return model ? (
										<ProgressBar model={model} />
									) : (
										<span className="reel-console__idle">
											{idleText(t, live[t.id])}
										</span>
									);
								})()}
								{(t.error ||
									t.transcode_error ||
									t.hls_error) && (
									<span className="reel-console__rowerr">
										{t.error ??
											t.transcode_error ??
											t.hls_error}
									</span>
								)}
							</div>
							<div className="reel-console__actions">
								<button
									type="button"
									className={`reel-console__btn${
										selectedId === t.id
											? ' reel-console__btn--active'
											: ''
									}`}
									disabled={!playable}
									onClick={() => selectReel(t.id)}>
									{selectedId === t.id ? 'Playing' : 'Play'}
								</button>
								<button
									type="button"
									className="reel-console__btn"
									disabled={
										busyId === t.id ||
										t.transcode === 'Pending' ||
										t.transcode === 'Remuxing' ||
										t.transcode === 'Encoding'
									}
									onClick={() => void transcode(t)}>
									Transcode
								</button>
								<button
									type="button"
									className="reel-console__btn reel-console__btn--danger"
									disabled={busyId === t.id}
									onClick={() => void remove(t)}>
									Delete
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
