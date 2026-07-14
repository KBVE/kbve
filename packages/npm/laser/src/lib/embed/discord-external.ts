import { setExternalOpener } from './external';

export interface DiscordExternalSdk {
	commands: {
		openExternalLink(args: { url: string }): Promise<unknown>;
		encourageHardwareAcceleration(): Promise<unknown>;
	};
}

export function installDiscordExternal(sdk: DiscordExternalSdk): void {
	setExternalOpener((url) => {
		void sdk.commands.openExternalLink({ url }).catch(() => undefined);
	});
}

export function encourageHardwareAcceleration(sdk: DiscordExternalSdk): void {
	void sdk.commands.encourageHardwareAcceleration().catch(() => undefined);
}
