import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

export function ZoneBanner() {
	const [zone, setZone] = useState<string | null>(null);
	useEffect(() => {
		let timer = 0;
		const off = laserEvents.on('zone:enter', (data) => {
			const z = (data as { name: string }).name;
			setZone(z);
			window.clearTimeout(timer);
			timer = window.setTimeout(() => setZone(null), 3200);
		});
		return () => {
			off();
			window.clearTimeout(timer);
		};
	}, []);
	if (!zone) return null;
	return (
		<div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 animate-pulse">
			<div className="rounded-full border border-amber-200/20 bg-black/50 px-6 py-1.5 text-center backdrop-blur-md">
				<p className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-lg font-bold tracking-wide text-transparent">
					{zone}
				</p>
			</div>
		</div>
	);
}
