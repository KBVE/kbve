type ViewTransitionDoc = Document & {
	startViewTransition?: (callback: () => void) => unknown;
};

export function withViewTransition(update: () => void): void {
	const doc = document as ViewTransitionDoc;
	if (typeof doc.startViewTransition === 'function') {
		doc.startViewTransition(update);
	} else {
		update();
	}
}
