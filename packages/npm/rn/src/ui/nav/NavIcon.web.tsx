import Svg, { Path } from 'react-native-svg';

export interface NavIconProps {
	name: string;
	size?: number;
	color?: string;
}

const PATHS: Record<string, string> = {
	'chevron-back': 'M15 5 l-7 7 7 7',
	'chevron-forward': 'M9 5 l7 7 -7 7',
	home: 'M3 10.5 L12 3 l9 7.5 M5 9.5 V20 h5 v-6 h4 v6 h5 V9.5',
	grid: 'M4 4 h6 v6 h-6 Z M14 4 h6 v6 h-6 Z M4 14 h6 v6 h-6 Z M14 14 h6 v6 h-6 Z',
	chatbubble:
		'M4 5 h16 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H10 l-5 4 v-4 H4 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 Z',
	chatbubbles:
		'M4 5 h16 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H10 l-5 4 v-4 H4 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 Z',
	sparkles:
		'M12 3 l1.6 5.4 5.4 1.6 -5.4 1.6 -1.6 5.4 -1.6 -5.4 -5.4 -1.6 5.4 -1.6 Z',
	build: 'M14 6 a3 3 0 1 0 -1 5.5 L5 19.5 l1.5 1.5 8-8 A3 3 0 0 0 14 6 Z',
	'git-branch': 'M6 3 v12 M6 18 a2 2 0 1 0 0 0.1 M18 6 a2 2 0 1 0 0 0.1 M18 8 v3 a4 4 0 0 1 -4 4 H8',
	git: 'M6 3 v12 M6 18 a2 2 0 1 0 0 0.1 M18 6 a2 2 0 1 0 0 0.1 M18 8 v3 a4 4 0 0 1 -4 4 H8',
	rocket: 'M12 3 c4 2 6 6 5 12 l-3 -2 -4 0 -3 2 c-1 -6 1 -10 5 -12 Z M9 15 l-2 4 M15 15 l2 4',
	'cloud-upload': 'M7 18 a4 4 0 0 1 0 -8 a5 5 0 0 1 9.5 1.5 A3.5 3.5 0 0 1 16 18 M12 14 v-5 M9 11 l3 -3 3 3',
	publish: 'M7 18 a4 4 0 0 1 0 -8 a5 5 0 0 1 9.5 1.5 A3.5 3.5 0 0 1 16 18 M12 14 v-5 M9 11 l3 -3 3 3',
	flask: 'M9 3 h6 M10 3 v6 l-4 8 a1 1 0 0 0 1 1.5 h10 a1 1 0 0 0 1 -1.5 l-4 -8 V3',
	test: 'M9 3 h6 M10 3 v6 l-4 8 a1 1 0 0 0 1 1.5 h10 a1 1 0 0 0 1 -1.5 l-4 -8 V3',
	radio: 'M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M8 8 a5.6 5.6 0 0 0 0 8 M16 8 a5.6 5.6 0 0 1 0 8 M5.5 5.5 a9 9 0 0 0 0 13 M18.5 5.5 a9 9 0 0 1 0 13',
	live: 'M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M8 8 a5.6 5.6 0 0 0 0 8 M16 8 a5.6 5.6 0 0 1 0 8 M5.5 5.5 a9 9 0 0 0 0 13 M18.5 5.5 a9 9 0 0 1 0 13',
	deploy: 'M12 3 c4 2 6 6 5 12 l-3 -2 -4 0 -3 2 c-1 -6 1 -10 5 -12 Z M9 15 l-2 4 M15 15 l2 4',
	settings:
		'M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z M12 3 l1 2.5 2.5 -1 -1 2.5 2.5 1 -2.5 1 1 2.5 -2.5 -1 -1 2.5 -1 -2.5 -2.5 1 1 -2.5 -2.5 -1 2.5 -1 -1 -2.5 2.5 1 Z',
	person: 'M12 12 a4 4 0 1 0 0 -8 a4 4 0 0 0 0 8 Z M5 20 a7 7 0 0 1 14 0',
	search: 'M10 4 a6 6 0 1 0 0 12 a6 6 0 0 0 0 -12 Z M15 15 l5 5',
	notifications: 'M12 3 a5 5 0 0 0 -5 5 c0 6 -2 7 -2 8 h14 c0 -1 -2 -2 -2 -8 a5 5 0 0 0 -5 -5 Z M10 20 a2 2 0 0 0 4 0',
	menu: 'M4 6 h16 M4 12 h16 M4 18 h16',
	close: 'M6 6 l12 12 M18 6 l-12 12',
	add: 'M12 5 v14 M5 12 h14',
};

const FALLBACK = 'M12 12 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0';

export function NavIcon({ name, size = 22, color = '#f5ecd8' }: NavIconProps) {
	const d = PATHS[name] ?? PATHS[name.replace(/-outline$/, '')] ?? FALLBACK;
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24">
			<Path
				d={d}
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
		</Svg>
	);
}
