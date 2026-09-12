import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const info = await sharp(here('og.svg'), { density: 144 })
	.resize(1200, 630)
	.png({ compressionLevel: 9 })
	.toFile(here('../../public/og.png'));

console.log(`public/og.png ${info.width}x${info.height} ${info.size} bytes`);
