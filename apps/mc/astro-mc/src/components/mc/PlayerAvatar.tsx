import { useState, useEffect, useRef } from 'react';

const STEVE_FALLBACK =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAKUlEQVQI12P4z8BAAGBiYCAEMDEQBhj+MxAJWBgIAUwMhAAWBkIAAQAA//8HSwS9zNrJYAAAAABJRU5ErkJggg==';

/**
 * Crops the face region from a Minecraft skin texture.
 * Face: pixels (8,8) to (16,16)
 * Overlay: pixels (40,8) to (48,16)
 */
function cropFace(skinDataUrl: string, size: number): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				resolve(STEVE_FALLBACK);
				return;
			}
			// Disable image smoothing for pixel-crisp rendering
			ctx.imageSmoothingEnabled = false;

			// Draw base face (8,8,8,8) scaled to full canvas
			ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);

			// Draw overlay/hat layer (40,8,8,8) on top
			ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);

			resolve(canvas.toDataURL('image/png'));
		};
		img.onerror = () => resolve(STEVE_FALLBACK);
		img.src = skinDataUrl;
	});
}

export interface PlayerAvatarProps {
	skinDataUrl: string | null;
	size?: number;
	className?: string;
}

export default function PlayerAvatar({
	skinDataUrl,
	size = 32,
	className,
}: PlayerAvatarProps) {
	const [faceUrl, setFaceUrl] = useState<string>(STEVE_FALLBACK);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		if (!skinDataUrl) {
			setFaceUrl(STEVE_FALLBACK);
			return;
		}
		cropFace(skinDataUrl, size).then((url) => {
			if (mounted.current) setFaceUrl(url);
		});
		return () => {
			mounted.current = false;
		};
	}, [skinDataUrl, size]);

	return (
		<img
			src={faceUrl}
			alt="Player avatar"
			width={size}
			height={size}
			className={className}
			style={{
				imageRendering: 'pixelated',
				borderRadius: 2,
			}}
		/>
	);
}
