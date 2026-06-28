// Optional external-link opener. The Discord Activity sandbox can't open a bare
// new tab — discord.tsx registers an opener backed by the embedded SDK's
// openExternalLink. The plain web embed leaves this unset, so links fall back to
// native anchor navigation (target="_blank"). Read at render time on the boot
// screen, which only mounts after discord.tsx has the SDK ready.
let opener: ((url: string) => void) | null = null;

export function setExternalOpener(fn: ((url: string) => void) | null): void {
	opener = fn;
}

export function getExternalOpener(): ((url: string) => void) | null {
	return opener;
}
