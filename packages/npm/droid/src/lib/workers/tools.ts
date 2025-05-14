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
		for (const [k, v] of Object.entries(vnode.attrs)) {
			el.setAttribute(k, v);
		}
	}

	if (vnode.style) {
		Object.assign(el.style, vnode.style);
	}

	if (vnode.children) {
		for (const child of vnode.children) {
			el.appendChild(
				typeof child === 'string' ? document.createTextNode(child) : renderVNode(child)
			);
		}
	}

	return el;
}
