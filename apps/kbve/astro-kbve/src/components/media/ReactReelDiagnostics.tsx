import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { DroidEvents, type ReelStreamPayload } from '@kbve/droid';
import { $reelStatus } from './reelService';

const CODE_HINT: Record<string, string> = {
	'sign-in': 'Sign in as staff to watch.',
	'not-found': 'This reel no longer exists on the server.',
	reaped: 'Expired from the cache — re-add it to watch.',
	'download-failed': 'The download failed on the server.',
	'token-expired': 'Media token expired — refreshing automatically.',
	network: 'Network hiccup reaching the stream.',
	media: 'Decoder error — rebuilding the buffer.',
	'manifest-flip':
		'Stream changed shape (finished downloading, or switched to a transcode).',
	'transcode-timeout': 'Still preparing — the server is transcoding.',
	unsupported: 'This browser or delivery mode is unsupported.',
	unknown: 'Unexpected error.',
};

const STAGE_CLASS: Record<string, string> = {
	loading: 'reel-diag__ev--info',
	probing: 'reel-diag__ev--info',
	playing: 'reel-diag__ev--ok',
	reconnecting: 'reel-diag__ev--warn',
	error: 'reel-diag__ev--err',
};

interface LogEntry extends ReelStreamPayload {
	seq: number;
}

const MAX_LOG = 25;

export default function ReactReelDiagnostics() {
	const status = useStore($reelStatus);
	const [log, setLog] = useState<LogEntry[]>([]);
	const seq = useRef(0);

	useEffect(() => {
		const handler = (p: ReelStreamPayload) => {
			setLog((prev) =>
				[...prev, { ...p, seq: seq.current++ }].slice(-MAX_LOG),
			);
		};
		DroidEvents.on('reel-stream', handler);
		return () => DroidEvents.off('reel-stream', handler);
	}, []);

	if (!log.length) return null;

	const fmtTime = (ts: number) =>
		new Date(ts).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});

	return (
		<div className="reel-diag">
			<div className="reel-diag__head">
				<span className="reel-diag__title">Stream activity</span>
				{status?.stage === 'reconnecting' &&
					status.attempt &&
					status.max && (
						<span className="reel-diag__live">
							reconnecting {status.attempt}/{status.max}
						</span>
					)}
			</div>
			<ul className="reel-diag__log">
				{[...log].reverse().map((e) => (
					<li
						key={e.seq}
						className={`reel-diag__ev ${STAGE_CLASS[e.stage] ?? ''}`}>
						<span className="reel-diag__time">
							{fmtTime(e.timestamp)}
						</span>
						<span className="reel-diag__stage">{e.stage}</span>
						<span className="reel-diag__msg">
							{e.message}
							{e.code ? ` — ${CODE_HINT[e.code] ?? e.code}` : ''}
							{e.stage === 'reconnecting' && e.attempt && e.max
								? ` (${e.attempt}/${e.max})`
								: ''}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
