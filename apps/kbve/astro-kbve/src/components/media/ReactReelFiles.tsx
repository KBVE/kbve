import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { addToast } from '@kbve/droid';
import {
	$reelSelectedId,
	archiveDownloadHref,
	fetchReelFiles,
	fileDownloadHref,
	formatBytes,
	formatExpiry,
	ReelFilesNotReady,
	type ReelFileListing,
} from './reelService';

const NOT_READY_POLL_MS = 5000;

function kindOf(contentType: string): string {
	const [top, sub] = contentType.split('/');
	if (top === 'audio' || top === 'video' || top === 'image') return top;
	if (
		sub?.startsWith('zip') ||
		sub?.includes('compressed') ||
		sub === 'vnd.rar'
	)
		return 'archive';
	if (top === 'text') return 'text';
	return 'file';
}

export default function ReactReelFiles() {
	const id = useStore($reelSelectedId);
	const [listing, setListing] = useState<ReelFileListing | null>(null);
	const [notReady, setNotReady] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(async (torrentId: string) => {
		setLoading(true);
		try {
			const l = await fetchReelFiles(torrentId);
			setListing(l);
			setNotReady(null);
			setError(null);
		} catch (e) {
			setListing(null);
			if (e instanceof ReelFilesNotReady) {
				setNotReady(e.message);
				setError(null);
			} else {
				setNotReady(null);
				setError(
					e instanceof Error ? e.message : 'could not list files',
				);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!id) {
			setListing(null);
			setNotReady(null);
			setError(null);
			return;
		}
		void load(id);
	}, [id, load]);

	// Only poll while the torrent is still downloading — once the listing lands
	// it is stable, and a finished torrent needs no refresh loop.
	useEffect(() => {
		if (!id || !notReady) return;
		const t = setInterval(() => void load(id), NOT_READY_POLL_MS);
		return () => clearInterval(t);
	}, [id, notReady, load]);

	// The href carries a short-lived media token, so it is minted per click
	// rather than baked into the markup where it would go stale.
	const go = useCallback(
		async (key: string, href: () => Promise<string>, filename: string) => {
			setBusy(key);
			try {
				const url = await href();
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.rel = 'noopener';
				document.body.appendChild(a);
				a.click();
				a.remove();
			} catch (e) {
				addToast({
					id: `reel-download-${key}`,
					message: e instanceof Error ? e.message : 'download failed',
					severity: 'error',
					duration: 6000,
				});
			} finally {
				setBusy(null);
			}
		},
		[],
	);

	if (!id) {
		return (
			<div className="reel-files">
				<div className="reel-files__head">
					<span className="reel-files__title">Files</span>
				</div>
				<p className="reel-files__empty">
					Pick a reel in the console to list its files.
				</p>
			</div>
		);
	}

	return (
		<div className="reel-files">
			<div className="reel-files__head">
				<span className="reel-files__title">Files</span>
				{listing && (
					<span className="reel-files__meta">
						{listing.files.length} file
						{listing.files.length === 1 ? '' : 's'} ·{' '}
						{formatBytes(listing.total_bytes)}
						{formatExpiry(listing.expires_at)
							? ` · ${formatExpiry(listing.expires_at)}`
							: ''}
					</span>
				)}
			</div>

			{loading && !listing && (
				<p className="reel-files__empty">Listing files…</p>
			)}
			{notReady && <p className="reel-files__empty">{notReady}</p>}
			{error && <p className="reel-files__error">{error}</p>}

			{listing && listing.files.length > 0 && (
				<>
					<div className="reel-files__bulk">
						<button
							type="button"
							className="reel-files__btn reel-files__btn--primary"
							disabled={busy === 'archive'}
							onClick={() =>
								void go(
									'archive',
									() => archiveDownloadHref(listing.id),
									listing.archive_name,
								)
							}>
							{busy === 'archive'
								? 'Preparing…'
								: `Download all (${formatBytes(listing.total_bytes)})`}
						</button>
						<span className="reel-files__hint">
							Zipped on the fly — no re-compression, no wait.
						</span>
					</div>

					<ul className="reel-files__list">
						{listing.files.map((f) => {
							const key = `f${f.index}`;
							const base = f.name.split('/').pop() ?? f.name;
							return (
								<li key={f.index} className="reel-files__row">
									<div className="reel-files__info">
										<span className="reel-files__name">
											{f.name}
										</span>
										<span className="reel-files__sub">
											<span className="reel-files__badge">
												{kindOf(f.content_type)}
											</span>
											{formatBytes(f.size)}
										</span>
									</div>
									<button
										type="button"
										className="reel-files__btn"
										disabled={busy === key}
										onClick={() =>
											void go(
												key,
												() =>
													fileDownloadHref(
														listing.id,
														f.index,
													),
												base,
											)
										}>
										{busy === key ? '…' : 'Download'}
									</button>
								</li>
							);
						})}
					</ul>
				</>
			)}

			{listing && listing.files.length === 0 && (
				<p className="reel-files__empty">
					This reel has no files on disk.
				</p>
			)}
		</div>
	);
}
