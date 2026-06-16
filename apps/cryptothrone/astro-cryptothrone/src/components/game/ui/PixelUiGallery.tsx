import manifest from './pixelUiManifest.json';
import { PixelSprite, type PixelSheet } from './PixelSprite';

/** Dev overlay: every sliced frame from every sheet with its index, so frames
 * can be picked by eye for real UI. Mount temporarily; not wired by default. */
export function PixelUiGallery({ scale = 2 }: { scale?: number }) {
	const sheets = Object.keys(manifest) as PixelSheet[];
	return (
		<div className="pointer-events-auto absolute inset-0 z-50 overflow-auto bg-black/85 p-4 text-stone-200">
			{sheets.map((sheet) => {
				const def = (manifest as Record<string, { frames: unknown[] }>)[
					sheet
				];
				return (
					<div key={sheet} className="mb-6">
						<div className="mb-2 font-mono text-xs text-amber-300">
							{sheet} · {def.frames.length} frames
						</div>
						<div className="flex flex-wrap gap-3">
							{def.frames.map((_, i) => (
								<div
									key={i}
									className="flex flex-col items-center gap-1 rounded border border-white/10 bg-white/5 p-1">
									<PixelSprite
										sheet={sheet}
										frame={i}
										scale={scale}
									/>
									<span className="font-mono text-[0.6rem] text-stone-400">
										{i}
									</span>
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
