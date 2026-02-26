import { expose } from 'comlink';
import type { BaseModAPI, VirtualNode } from '../../../types/modules';
import {
	BentoTileSchema,
	type BentoTile,
	BENTO_BADGE_CLASS_MAP,
	BENTO_ANIMATION_CLASS_MAP,
	BENTO_VARIANT_CLASS_MAP,
} from '../../../types/bento';

let emitToMain: ((msg: unknown) => void) | undefined;

function createVNodeFromTile(tile: BentoTile): VirtualNode {
	const variant = tile.variant ?? 'default';
	const animationClass = tile.animation
		? BENTO_ANIMATION_CLASS_MAP[tile.animation]
		: '';
	const variantBase = BENTO_VARIANT_CLASS_MAP[variant]?.base ?? '';
	const variantHover = BENTO_VARIANT_CLASS_MAP[variant]?.hover ?? '';

	const rootClasses = [
		'bento-item',
		'col-span-1',
		'row-span-1',
		tile.span ?? 'md:col-span-2 md:row-span-1',
		'bg-gradient-to-br',
		tile.primaryColor ? `from-${tile.primaryColor}` : '',
		tile.secondaryColor ? `to-${tile.secondaryColor}` : '',
		'rounded-2xl overflow-hidden shadow-2xl',
		variantBase,
		variantHover ? `hover:${variantHover}` : '',
		animationClass,
		tile.className ?? '',
	]
		.filter(Boolean)
		.join(' ');

	const datasetAttrs = tile.dataset
		? Object.fromEntries(
				Object.entries(tile.dataset).map(([k, v]) => [`data-${k}`, v]),
			)
		: {};

	const wrapper: VirtualNode = {
		tag: tile.href ? 'a' : 'div',
		class: rootClasses,
		attrs: {
			...(tile.href
				? { href: tile.href, target: tile.target ?? '_self' }
				: {}),
			...(tile.onclick ? { onclick: tile.onclick } : {}),
			...(tile.ariaLabel ? { 'aria-label': tile.ariaLabel } : {}),
			...(tile.role ? { role: tile.role } : {}),
			...datasetAttrs,
		},
		children: [
			tile.badge && {
				tag: 'span',
				class: `absolute top-2 right-2 px-2 py-1 text-xs rounded z-10 ${BENTO_BADGE_CLASS_MAP[tile.badgeType ?? 'default']}`,
				children: [tile.badge],
			},
			{
				tag: 'div',
				class: 'p-4 flex flex-col justify-between h-full',
				children: [
					{
						tag: 'div',
						class: 'flex items-center gap-3',
						children: [
							tile.icon && {
								tag: 'div',
								class: 'text-2xl bg-white/20 rounded-full p-2 text-white',
								children: [tile.icon],
							},
							{
								tag: 'h3',
								class: 'text-white text-lg font-bold',
								children: [tile.title],
							},
						].filter(Boolean) as VirtualNode[],
					},
					tile.subtitle && {
						tag: 'p',
						class: 'text-sm text-white/80 mt-2',
						children: [tile.subtitle],
					},
					tile.description && {
						tag: 'p',
						class: 'text-xs text-white/60 mt-1',
						children: [tile.description],
					},
				].filter(Boolean) as VirtualNode[],
			},
		].filter(Boolean) as VirtualNode[],
	};

	return wrapper;
}

const api: BaseModAPI = {
	async getMeta() {
		return {
			name: 'bento',
			version: '0.1.0',
		};
	},

	async init(context) {
		emitToMain = context?.emitFromWorker;
	},

	async run(data: unknown) {
		if (!emitToMain) {
			console.warn('[mod-bento] emitFromWorker not defined');
			return;
		}

		try {
			const tile = BentoTileSchema.parse(data);
			const vnode = createVNodeFromTile(tile);
			emitToMain({ type: 'injectVNode', vnode });
		} catch (err) {
			console.error('[mod-bento] Invalid BentoTile data:', err);
		}
	},
};

expose(api);
