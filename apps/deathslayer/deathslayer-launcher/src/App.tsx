import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface GameStatus {
	installed: boolean;
	version: string | null;
	install_path: string | null;
	needs_update: boolean;
}

function App() {
	const [gameStatus, setGameStatus] = useState<GameStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');

	const loadGameStatus = async () => {
		try {
			const status = await invoke<GameStatus>('get_game_status');
			setGameStatus(status);
		} catch (error) {
			console.error('Failed to load game status:', error);
			setMessage('Failed to load game status');
		}
	};

	useEffect(() => {
		let active = true;
		invoke<GameStatus>('get_game_status')
			.then((status) => {
				if (active) setGameStatus(status);
			})
			.catch((error) => {
				console.error('Failed to load game status:', error);
				if (active) setMessage('Failed to load game status');
			});
		return () => {
			active = false;
		};
	}, []);

	const handleCheckUpdates = async () => {
		setLoading(true);
		setMessage('Checking for updates...');
		try {
			const version = await invoke<string>('check_updates');
			setMessage(`Latest version: ${version}`);
		} catch (error) {
			setMessage(`Error checking updates: ${error}`);
		} finally {
			setLoading(false);
		}
	};

	const handleDownload = async () => {
		setLoading(true);
		setMessage('Downloading game...');
		try {
			const result = await invoke<string>('download_game', {
				version: '0.1.0',
			});
			setMessage(result);
			await loadGameStatus();
		} catch (error) {
			setMessage(`Error downloading: ${error}`);
		} finally {
			setLoading(false);
		}
	};

	const handleLaunch = async () => {
		setLoading(true);
		setMessage('Launching Death Slayer...');
		try {
			await invoke('launch_game');
			setMessage('Game launched successfully!');
		} catch (error) {
			setMessage(`Error launching game: ${error}`);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 p-8">
			<div className="w-full max-w-2xl space-y-8">
				{/* Header */}
				<div className="text-center">
					<h1 className="text-6xl font-bold text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]">
						DEATH SLAYER
					</h1>
					<p className="mt-2 text-xl text-gray-400">Game Launcher</p>
				</div>

				{/* Status Card */}
				<div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 backdrop-blur-sm">
					<h2 className="mb-4 text-xl font-semibold text-white">
						Game Status
					</h2>
					{gameStatus ? (
						<div className="space-y-2 text-gray-300">
							<div className="flex justify-between">
								<span>Status:</span>
								<span
									className={
										gameStatus.installed
											? 'text-green-400'
											: 'text-yellow-400'
									}>
									{gameStatus.installed
										? 'Installed'
										: 'Not Installed'}
								</span>
							</div>
							{gameStatus.version && (
								<div className="flex justify-between">
									<span>Version:</span>
									<span className="text-blue-400">
										{gameStatus.version}
									</span>
								</div>
							)}
							{gameStatus.install_path && (
								<div className="flex justify-between">
									<span>Install Path:</span>
									<span className="truncate text-sm text-gray-400">
										{gameStatus.install_path}
									</span>
								</div>
							)}
						</div>
					) : (
						<p className="text-gray-400">Loading status...</p>
					)}
				</div>

				{/* Action Buttons */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<button
						onClick={handleCheckUpdates}
						disabled={loading}
						className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
						Check Updates
					</button>
					<button
						onClick={handleDownload}
						disabled={loading || gameStatus?.installed}
						className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
						{gameStatus?.installed ? 'Installed' : 'Download'}
					</button>
					<button
						onClick={handleLaunch}
						disabled={loading || !gameStatus?.installed}
						className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
						Launch Game
					</button>
				</div>

				{/* Message Display */}
				{message && (
					<div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 backdrop-blur-sm">
						<p className="text-center text-sm text-gray-300">
							{message}
						</p>
					</div>
				)}

				{/* Footer */}
				<div className="text-center text-xs text-gray-500">
					<p>Death Slayer © 2026 KBVE</p>
					<p className="mt-1">
						Visit{' '}
						<a
							href="https://kbve.itch.io/deathslayer"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-400 hover:text-blue-300">
							itch.io
						</a>{' '}
						for more information
					</p>
				</div>
			</div>
		</div>
	);
}

export default App;
