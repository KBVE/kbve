const NICK_COLORS = [
	'#fb7185',
	'#fb923c',
	'#facc15',
	'#a3e635',
	'#34d399',
	'#2dd4bf',
	'#22d3ee',
	'#38bdf8',
	'#a78bfa',
	'#e879f9',
	'#f472b6',
	'#818cf8',
];

export function nickColor(nick: string): string {
	let hash = 0;
	for (let i = 0; i < nick.length; i++) {
		hash = nick.charCodeAt(i) + ((hash << 5) - hash);
	}
	return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length];
}

export function nickInitial(nick: string): string {
	return nick.trim().charAt(0).toUpperCase() || '?';
}

export function formatTime(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
