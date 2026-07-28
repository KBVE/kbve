import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { homeService } from '@/components/dashboard/homeService';
import {
	$reelList,
	$reelListError,
	$reelListLoading,
	$reelLive,
	$reelHealth,
	addTorrent,
	deleteTorrent,
	startTranscode,
	refreshReelList,
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

function progressLine(t: ReelTorrent, live: ReelLive | undefined): string {
	if (t.state === 'Leeching') {
		if (!live || live.total_bytes === 0) {
			const seen = live?.peers_seen ?? 0;
			return seen > 0
				? `resolving metadata • ${seen} peer${seen === 1 ? '' : 's'} seen`
				: 'searching for peers…';
		}
		const pct = Math.min(
			100,
			Math.floor((live.progress_bytes / live.total_bytes) * 100),
		);
		const speed = live.download_mbps
			? ` • ${live.download_mbps.toFixed(1)} MB/s`
			: '';
		return `${pct}% of ${fmtSize(live.total_bytes)}${speed} • ${live.peers_live} peer${live.peers_live === 1 ? '' : 's'}`;
	}
	if (t.state === 'Seeding' && live && live.upload_mbps) {
		return `seeding • ↑ ${live.upload_mbps.toFixed(1)} MB/s • ${live.peers_live} peer${live.peers_live === 1 ? '' : 's'}`;
	}
	return fmtSize(t.size);
}

export default function ReactReelConsole() {
	const list = useStore($reelList);
	const listError = useStore($reelListError);
	const loading = useStore($reelListLoading);
	const live = useStore($reelLive);
	const health = useStore($reelHealth);
	const isStaff = useStore(homeService.$isStaff);

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
					Reel management is restricted to KBVE staff. Sign in with a
					staff account to add, transcode, or remove reels.
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
									<span>{progressLine(t, live[t.id])}</span>
									{t.transcode !== 'None' && (
										<span>
											transcode: {t.transcode}
											{t.transcode_progress != null &&
											(t.transcode === 'Remuxing' ||
												t.transcode === 'Encoding')
												? ` ${t.transcode_progress}%`
												: ''}
										</span>
									)}
									{t.hls !== 'None' && (
										<span>hls: {t.hls}</span>
									)}
								</span>
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
								<a
									className="reel-console__btn"
									aria-disabled={!playable}
									href={
										playable
											? `?id=${encodeURIComponent(t.id)}`
											: undefined
									}>
									Play
								</a>
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
