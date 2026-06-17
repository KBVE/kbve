import { Minimap } from '../Minimap';

export function MapPanel() {
	return (
		<div className="flex flex-col items-center gap-2 text-yellow-400">
			<h2 className="self-start text-lg font-semibold">Map</h2>
			<Minimap
				size={260}
				className="w-full max-w-[260px] rounded-lg border border-white/10 bg-black/50"
			/>
		</div>
	);
}
