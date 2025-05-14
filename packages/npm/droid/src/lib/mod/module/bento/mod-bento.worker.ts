import { expose } from 'comlink';
import type { BaseModAPI } from '../../../types/modules';
import { BentoTileSchema, type BentoTile } from '../../../types/bento';

let kbve: any;

function injectTile(tile: BentoTile) {
	const container = document.getElementById('bento-grid');
	if (!container) return;

	const div = document.createElement('div');
	div.className = `bento-item ${tile.span || 'col-span-2 row-span-1'}`;
	div.innerText = tile.title;
	container.appendChild(div);
}

const api: BaseModAPI = {
	async getMeta() {
		return {
			name: 'bento',
			version: '0.0.1',
		};
	},

	async init(kbveGlobal) {
		kbve = kbveGlobal;
	},

	async run(data: unknown) {
		const tile = BentoTileSchema.parse(data);
		injectTile(tile);
	},
};

expose(api);
