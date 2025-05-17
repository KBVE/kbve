import type { VirtualNode } from '../types/modules';

export function dispatchAsync(fn: () => void) {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(fn);
	} else {
		setTimeout(fn, 0);
	}
}

export function renderVNode(vnode: VirtualNode): HTMLElement {
	const el = document.createElement(vnode.tag);

	if (vnode.class) el.className = vnode.class;

	if (vnode.attrs) {
		for (const [key, value] of Object.entries(vnode.attrs)) {
			if (typeof value === 'function' && key.startsWith('on')) {
				el.addEventListener(key.slice(2).toLowerCase(), value);
			} else if (key === 'style' && typeof value === 'object') {
				Object.assign(el.style, value);
			} else if (key === 'dataset' && typeof value === 'object') {
				for (const [data_key, data_value] of Object.entries(value)) {
					el.dataset[data_key] = String(data_value);
				}
			} else {
				try {
					el.setAttribute(key, String(value));
				} catch {
					//
				}
			}
		}
	}

	if (vnode.style) {
		Object.assign(el.style, vnode.style);
	}

	// if (vnode.children) {
	// 	for (const child of vnode.children) {
	// 		el.appendChild(
	// 			typeof child === 'string'
	// 				? document.createTextNode(child)
	// 				: renderVNode(child),
	// 		);
	// 	}
	// }

	if (vnode.children) {
		for (const child of vnode.children) {
			const node = typeof child === 'string'
				? document.createTextNode(child)
				: renderVNode(child);
			el.appendChild(node);
		}
	}

	return el;
}
