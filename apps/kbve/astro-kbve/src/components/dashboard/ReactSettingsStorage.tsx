import { useState, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw, Loader2 } from 'lucide-react';
import {
	statsGridStyle,
	statBoxStyle,
	statLabelStyle,
	statValueStyle,
	progressBarBgStyle,
	progressBarFillStyle,
	dangerButtonStyle,
	secondaryButtonStyle,
	successMsgStyle,
	formatBytes,
} from './settingsStyles';

interface StorageEstimate {
	usage: string;
	quota: string;
	percent: number;
}

export default function ReactSettingsStorage() {
	const [clearing, setClearing] = useState(false);
	const [cleared, setCleared] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
	const [lsCount, setLsCount] = useState(0);

	const refreshStats = useCallback(() => {
		try {
			setLsCount(localStorage.length);
		} catch {
			setLsCount(0);
		}

		if (navigator.storage?.estimate) {
			navigator.storage.estimate().then((est) => {
				setEstimate({
					usage: formatBytes(est.usage ?? 0),
					quota: formatBytes(est.quota ?? 0),
					percent:
						est.quota && est.quota > 0
							? Math.round(((est.usage ?? 0) / est.quota) * 100)
							: 0,
				});
			});
		}
	}, []);

	useEffect(() => {
		refreshStats();
	}, [refreshStats]);

	const handleRefresh = useCallback(() => {
		if (refreshing) return;
		setRefreshing(true);
		refreshStats();
		setTimeout(() => setRefreshing(false), 600);
	}, [refreshing, refreshStats]);

	const handleClear = useCallback(async () => {
		if (
			!window.confirm(
				'This will clear all local data including cached sessions. You may need to log in again. Continue?',
			)
		) {
			return;
		}

		setClearing(true);
		setCleared(false);

		try {
			localStorage.clear();

			const dbs = await window.indexedDB.databases?.();
			if (dbs) {
				for (const db of dbs) {
					if (db.name) {
						window.indexedDB.deleteDatabase(db.name);
					}
				}
			} else {
				for (const name of ['sb-auth-v2', 'sb-auth']) {
					window.indexedDB.deleteDatabase(name);
				}
			}

			if ('caches' in window) {
				const keys = await caches.keys();
				for (const key of keys) {
					await caches.delete(key);
				}
			}

			setCleared(true);
			refreshStats();
		} catch (err) {
			console.error('[Settings] Clear storage error:', err);
		} finally {
			setClearing(false);
		}
	}, [refreshStats]);

	return (
		<>
			<div style={statsGridStyle}>
				<div style={statBoxStyle}>
					<span style={statLabelStyle}>localStorage Keys</span>
					<span style={statValueStyle}>{lsCount}</span>
				</div>
				{estimate && (
					<>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>IndexedDB Usage</span>
							<span style={statValueStyle}>{estimate.usage}</span>
						</div>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>Storage Quota</span>
							<span style={statValueStyle}>{estimate.quota}</span>
						</div>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>Used</span>
							<span style={statValueStyle}>
								{estimate.percent}%
							</span>
						</div>
					</>
				)}
			</div>

			{estimate && estimate.percent > 0 && (
				<div style={progressBarBgStyle}>
					<div
						style={{
							...progressBarFillStyle,
							width: `${Math.min(estimate.percent, 100)}%`,
							background:
								estimate.percent > 80
									? '#ef4444'
									: estimate.percent > 50
										? '#f59e0b'
										: '#22c55e',
						}}
					/>
				</div>
			)}

			<div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
				<button
					onClick={handleClear}
					disabled={clearing}
					style={dangerButtonStyle}>
					{clearing ? (
						<Loader2
							size={14}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
					) : (
						<Trash2 size={14} />
					)}
					{clearing ? 'Clearing...' : 'Clear All Data'}
				</button>
				<button
					onClick={handleRefresh}
					disabled={refreshing}
					style={{
						...secondaryButtonStyle,
						opacity: refreshing ? 0.7 : 1,
						cursor: refreshing ? 'wait' : 'pointer',
					}}>
					<RefreshCw
						size={14}
						style={
							refreshing
								? { animation: 'spin 1s linear infinite' }
								: {}
						}
					/>
					{refreshing ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>

			{cleared && (
				<p style={successMsgStyle}>
					All local data cleared. Reload the page for a fresh start.
				</p>
			)}
		</>
	);
}
