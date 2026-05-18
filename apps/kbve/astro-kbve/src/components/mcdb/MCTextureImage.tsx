import { useState } from 'react';
import { mcTextureUrls } from './texture';

type Props = {
	ref: string;
	category?: string | null;
	size?: number;
	alt?: string;
	className?: string;
};

export function MCTextureImage({
	ref,
	category,
	size = 32,
	alt,
	className,
}: Props) {
	const { primary, fallback } = mcTextureUrls(ref, category);
	const [src, setSrc] = useState(primary);
	const [failed, setFailed] = useState(false);

	const onError = () => {
		if (src === primary) {
			setSrc(fallback);
			return;
		}
		setFailed(true);
	};

	if (failed) {
		const initial = ref.charAt(0).toUpperCase();
		return (
			<span
				className={`kbve-mc-tex kbve-mc-tex--missing${className ? ` ${className}` : ''}`}
				style={{ width: size, height: size, fontSize: size * 0.5 }}
				aria-label={alt ?? ref}>
				{initial}
			</span>
		);
	}

	return (
		<img
			src={src}
			alt={alt ?? ref}
			width={size}
			height={size}
			onError={onError}
			loading="lazy"
			className={`kbve-mc-tex${className ? ` ${className}` : ''}`}
			style={{ imageRendering: 'pixelated' }}
		/>
	);
}

export default MCTextureImage;
