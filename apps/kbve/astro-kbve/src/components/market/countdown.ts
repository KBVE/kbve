import { useEffect, useState } from 'react';

export type Countdown = {
	expired: boolean;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	totalMs: number;
};

function compute(iso: string): Countdown {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0)
		return {
			expired: true,
			days: 0,
			hours: 0,
			minutes: 0,
			seconds: 0,
			totalMs: 0,
		};
	const totalSec = Math.floor(ms / 1000);
	return {
		expired: false,
		days: Math.floor(totalSec / 86400),
		hours: Math.floor((totalSec % 86400) / 3600),
		minutes: Math.floor((totalSec % 3600) / 60),
		seconds: totalSec % 60,
		totalMs: ms,
	};
}

export function useCountdown(iso: string | null | undefined): Countdown {
	const [state, setState] = useState<Countdown>(() =>
		iso
			? compute(iso)
			: {
					expired: true,
					days: 0,
					hours: 0,
					minutes: 0,
					seconds: 0,
					totalMs: 0,
				},
	);
	useEffect(() => {
		if (!iso) return;
		setState(compute(iso));
		const tick = () => setState(compute(iso));
		const intervalMs = compute(iso).totalMs < 60_000 ? 1000 : 30_000;
		const id = window.setInterval(tick, intervalMs);
		return () => window.clearInterval(id);
	}, [iso]);
	return state;
}

export function formatCountdown(c: Countdown): string {
	if (c.expired) return 'expired';
	if (c.days > 0) return `${c.days}d ${c.hours}h`;
	if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
	if (c.minutes > 0)
		return `${c.minutes}m ${c.seconds.toString().padStart(2, '0')}s`;
	return `${c.seconds}s`;
}
