export type ExternalOpener = (url: string) => void;

let opener: ExternalOpener | null = null;

export function setExternalOpener(fn: ExternalOpener | null): void {
	opener = fn;
}

export function getExternalOpener(): ExternalOpener | null {
	return opener;
}

export function openExternal(url: string): void {
	if (opener) {
		opener(url);
		return;
	}
	if (typeof window !== 'undefined') {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
}

export function onExternalClick(url: string) {
	return (e: { preventDefault: () => void }) => {
		if (opener) {
			e.preventDefault();
			opener(url);
		}
	};
}
