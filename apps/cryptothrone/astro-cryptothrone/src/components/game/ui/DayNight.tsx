import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

function tint(phase: number): string {
	if (phase < 0.05 || phase >= 0.92) return 'rgba(10,14,40,0.45)'; // night
	if (phase < 0.15) return 'rgba(255,150,80,0.18)'; // dawn
	if (phase < 0.7) return 'rgba(0,0,0,0)'; // day
	if (phase < 0.85) return 'rgba(255,120,60,0.2)'; // dusk
	return 'rgba(20,20,60,0.3)'; // evening
}

export function DayNight() {
	const [color, setColor] = useState('rgba(0,0,0,0)');
	useEffect(() => {
		return laserEvents.on('world:time', (d) => {
			setColor(tint((d as { phase: number }).phase));
		});
	}, []);
	return (
		<div
			className="pointer-events-none absolute inset-0 z-10 transition-colors duration-1000"
			style={{ backgroundColor: color }}
			aria-hidden="true"
		/>
	);
}
