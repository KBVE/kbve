import { useState, type ComponentType, type SVGProps } from 'react';
import { laserEvents } from '@kbve/laser';
import { onExternalClick } from '../../../../lib/kbve-links';
import { DiscordLobby } from './DiscordLobby';
import { WaveIcon, SmileIcon, HeartIcon, FlameIcon, AngryIcon } from './icons';

const EMOTES: {
	emoji: string;
	label: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
	{ emoji: '👋', label: 'Wave', Icon: WaveIcon },
	{ emoji: '😄', label: 'Smile', Icon: SmileIcon },
	{ emoji: '❤️', label: 'Heart', Icon: HeartIcon },
	{ emoji: '🔥', label: 'Fire', Icon: FlameIcon },
	{ emoji: '😡', label: 'Angry', Icon: AngryIcon },
];

const icon: SVGProps<SVGSVGElement> = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
	className: 'h-4 w-4',
};

export function SocialPanel() {
	const [copied, setCopied] = useState(false);

	const share = async () => {
		try {
			await navigator.clipboard.writeText(
				'https://cryptothrone.com/game/play/',
			);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	};

	const fullscreen = () => {
		const el = document.documentElement;
		if (document.fullscreenElement) document.exitFullscreen?.();
		else el.requestFullscreen?.();
	};

	return (
		<div className="flex flex-col gap-4 text-yellow-400">
			<DiscordLobby />
			<div>
				<h2 className="mb-2 text-lg font-semibold">Connect</h2>
				<div className="flex flex-wrap gap-2">
					<a
						href="https://kbve.com/discord/"
						target="_blank"
						rel="noopener"
						onClick={onExternalClick('https://kbve.com/discord/')}
						className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-[#5865f2] transition hover:border-[#5865f2]/50">
						<svg
							viewBox="0 0 16 16"
							fill="currentColor"
							className="h-4 w-4">
							<path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8.3 8.3 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.001.014.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041q.36.698.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
						</svg>
						Discord
					</a>
					<button
						type="button"
						onClick={share}
						className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-stone-300 transition hover:text-amber-300">
						{copied ? (
							<svg {...icon}>
								<path d="M20 6 9 17l-5-5" />
							</svg>
						) : (
							<svg {...icon}>
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
							</svg>
						)}
						{copied ? 'Copied' : 'Invite'}
					</button>
					<button
						type="button"
						onClick={fullscreen}
						className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-stone-300 transition hover:text-amber-300">
						<svg {...icon}>
							<path d="M8 3H5a2 2 0 0 0-2 2v3" />
							<path d="M21 8V5a2 2 0 0 0-2-2h-3" />
							<path d="M3 16v3a2 2 0 0 0 2 2h3" />
							<path d="M16 21h3a2 2 0 0 0 2-2v-3" />
						</svg>
						Fullscreen
					</button>
				</div>
			</div>

			<div>
				<h2 className="mb-2 text-lg font-semibold">Emotes</h2>
				<div className="flex flex-wrap gap-2">
					{EMOTES.map(({ emoji, label, Icon }) => (
						<button
							key={emoji}
							type="button"
							onClick={() => laserEvents.emit('emote', { emoji })}
							className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-stone-300 transition hover:border-amber-300/50 hover:text-amber-300"
							aria-label={`Emote ${label}`}>
							<Icon className="h-5 w-5" />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
