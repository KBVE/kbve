export const KBVE_DISCORD_URL = 'https://discord.gg/gDahHCXHnp';
export const KBVE_FEEDBACK_URL = 'https://kbve.com/support/';

export type OpenExternal = (url: string) => void;

export function getOpenExternal(): OpenExternal | undefined {
	if (typeof window === 'undefined') return undefined;
	return (window as unknown as { __ctOpenExternal?: OpenExternal })
		.__ctOpenExternal;
}
