// ReactGameServer.tsx - React component wrapper for game server UI
import { useState } from 'react';
import { useGS } from './useGS';
import { clsx } from 'clsx';

export function ReactGameServer() {
	const {
		status,
		logs,
		session,
		connect,
		disconnect,
		send,
		checkStatus,
		clearLogs,
	} = useGS();
	const [message, setMessage] = useState('');

	const handleSend = async () => {
		if (!message.trim()) {
			return;
		}

		try {
			const payload = JSON.parse(message);
			await send(payload);
			setMessage('');
		} catch (err) {
			// If not valid JSON, send as echo message
			await send({ type: 'echo', message });
			setMessage('');
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSend();
		}
	};

	return (
		<div className="font-mono p-5 bg-[#1a1a1a] text-[#00ff00] min-h-[400px]">
			<h1 className="text-2xl mb-4">WebSocket Game Server Test</h1>

			{/* Status Indicator */}
			<div className="mb-4 flex items-center gap-3">
				<span className="font-bold">Status:</span>
				<span
					className={clsx(
						'px-3 py-1 rounded',
						status.status === 'connected' &&
							'bg-green-900 text-green-200',
						status.status === 'connecting' &&
							'bg-yellow-900 text-yellow-200',
						status.status === 'disconnected' &&
							'bg-gray-700 text-gray-300',
						status.status === 'error' && 'bg-red-900 text-red-200',
					)}>
					{status.status.toUpperCase()}
				</span>
				{status.error && (
					<span className="text-red-400">({status.error})</span>
				)}
			</div>

			{/* Session Info */}
			{session && (
				<div className="mb-4 text-sm">
					<span className="text-yellow-400">User:</span>{' '}
					{session.user?.email || 'Unknown'}
				</div>
			)}

			{/* Control Buttons */}
			<div className="mb-4 flex gap-2 flex-wrap">
				<button
					onClick={connect}
					disabled={
						status.status === 'connected' ||
						status.status === 'connecting'
					}
					className={clsx(
						'px-4 py-2 font-bold border-none cursor-pointer',
						status.status === 'connected' ||
							status.status === 'connecting'
							? 'bg-gray-600 text-gray-400 cursor-not-allowed'
							: 'bg-[#00ff00] text-black hover:bg-[#00cc00]',
					)}>
					Connect WebSocket
				</button>

				<button
					onClick={disconnect}
					disabled={status.status === 'disconnected'}
					className={clsx(
						'px-4 py-2 font-bold border-none cursor-pointer',
						status.status === 'disconnected'
							? 'bg-gray-600 text-gray-400 cursor-not-allowed'
							: 'bg-[#00ff00] text-black hover:bg-[#00cc00]',
					)}>
					Disconnect WebSocket
				</button>

				<button
					onClick={checkStatus}
					className="px-4 py-2 font-bold border-none cursor-pointer bg-[#00ff00] text-black hover:bg-[#00cc00]">
					Check Status
				</button>

				<button
					onClick={clearLogs}
					className="px-4 py-2 font-bold border-none cursor-pointer bg-[#00ff00] text-black hover:bg-[#00cc00]">
					Clear Log
				</button>
			</div>

			{/* Message Input */}
			<div className="mb-4 flex gap-2">
				<input
					type="text"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Enter message (JSON or text)..."
					className="flex-1 bg-black text-[#00ff00] border border-[#00ff00] px-3 py-2 font-mono"
				/>
				<button
					onClick={handleSend}
					disabled={!message.trim() || status.status !== 'connected'}
					className={clsx(
						'px-4 py-2 font-bold border-none cursor-pointer',
						!message.trim() || status.status !== 'connected'
							? 'bg-gray-600 text-gray-400 cursor-not-allowed'
							: 'bg-[#00ff00] text-black hover:bg-[#00cc00]',
					)}>
					Send Message
				</button>
			</div>

			{/* Log Display */}
			<div className="bg-black border border-[#00ff00] p-3 max-h-[400px] overflow-y-auto">
				{logs.length === 0 ? (
					<div className="text-gray-500">No logs yet...</div>
				) : (
					logs.map((log, idx) => (
						<div
							key={idx}
							className={clsx(
								'py-0.5 font-mono text-sm',
								log.type === 'error' && 'text-red-500',
								log.type === 'success' && 'text-[#00ff00]',
								log.type === 'info' && 'text-yellow-400',
							)}>
							[{new Date(log.timestamp).toLocaleTimeString()}]{' '}
							{log.message}
						</div>
					))
				)}
			</div>
		</div>
	);
}
