import { laserEvents } from '@kbve/laser';

const EMOTES = ['👋', '😄', '❤️', '🔥', '😡'];

export function EmoteBar() {
	return (
		<div className="pointer-events-auto absolute bottom-16 right-3 z-30 flex flex-col gap-1">
			{EMOTES.map((e) => (
				<button
					key={e}
					type="button"
					onClick={() => laserEvents.emit('emote', { emoji: e })}
					className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-sm backdrop-blur-md transition hover:border-amber-300/50"
					aria-label={`Emote ${e}`}>
					{e}
				</button>
			))}
		</div>
	);
}
