import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const TARGETS = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of TARGETS) {
	const info = await sharp(here('icon.svg'), { density: 384 })
		.resize(size, size)
		.png({ compressionLevel: 9 })
		.toFile(here(`../../public/${file}`));

	console.log(`public/${file} ${info.width}x${info.height} ${info.size} bytes`);
}
