import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
};

export function CharacterIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="8" r="4" />
			<path d="M4 21a8 8 0 0 1 16 0" />
		</svg>
	);
}

export function BagIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
			<path d="M3 6h18" />
			<path d="M16 10a4 4 0 0 1-8 0" />
		</svg>
	);
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
		</svg>
	);
}

export function MapIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
			<path d="M15 5.764v15" />
			<path d="M9 3.236v15" />
		</svg>
	);
}

export function SocialIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
	);
}

export function WaveIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
			<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
			<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
			<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
		</svg>
	);
}

export function SmileIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="M8 14s1.5 2 4 2 4-2 4-2" />
			<line x1="9" x2="9.01" y1="9" y2="9" />
			<line x1="15" x2="15.01" y1="9" y2="9" />
		</svg>
	);
}

export function HeartIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
		</svg>
	);
}

export function FlameIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
		</svg>
	);
}

export function AngryIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="M16 16s-1.5-2-4-2-4 2-4 2" />
			<path d="M7.5 8 10 9" />
			<path d="m14 9 2.5-1" />
			<path d="M9 10h.01" />
			<path d="M15 10h.01" />
		</svg>
	);
}
