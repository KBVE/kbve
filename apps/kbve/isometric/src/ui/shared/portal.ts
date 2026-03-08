const portalCache = new Map<string, HTMLElement>();

const Z_INDEX: Record<string, string> = {
	'toast-root': '100',
	'modal-root': '90',
	'menu-root': '80',
};

export function getPortalRoot(id: string): HTMLElement {
	let el = portalCache.get(id);
	if (!el || !document.body.contains(el)) {
		el = document.createElement('div');
		el.id = id;
		el.style.position = 'fixed';
		el.style.inset = '0';
		el.style.pointerEvents = 'none';
		el.style.zIndex = Z_INDEX[id] ?? '50';
		document.body.appendChild(el);
		portalCache.set(id, el);
	}
	return el;
}
