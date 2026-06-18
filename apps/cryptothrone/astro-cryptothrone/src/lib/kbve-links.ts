export const KBVE_DISCORD_URL = 'https://discord.gg/gDahHCXHnp';
export const KBVE_FEEDBACK_URL = 'https://kbve.com/support/';

/**
 * Open a URL from inside the game. A Discord Activity runs in a sandboxed
 * iframe where normal anchor navigation is blocked — discord.tsx exposes
 * `window.__ctOpenExternal` (backed by `sdk.commands.openExternalLink`) once
 * the SDK is ready. Outside the Activity (standalone embed) the global is
 * absent and the caller falls back to a plain anchor / `window.open`.
 */
export type OpenExternal = (url: string) => void;

export function getOpenExternal(): OpenExternal | undefined {
	if (typeof window === 'undefined') return undefined;
	return (window as unknown as { __ctOpenExternal?: OpenExternal })
		.__ctOpenExternal;
}
