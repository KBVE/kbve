import { Events, type DiscordSDK } from '@discord/embedded-app-sdk';

/**
 * Relayout bridge for the Discord Activity. The client injects
 * `--discord-safe-area-inset-*` CSS vars on the iframe document root and updates
 * them on layout-mode (fullscreen / PiP / focused) and orientation changes —
 * but they are empty until the first such event fires
 * (discord/embedded-app-sdk#304). HUD CSS reads the vars directly with a 0px
 * fallback; here we only nudge a window resize so Phaser's FIT scale manager
 * refits the canvas to the new viewport on each event.
 */
export function startLayout(sdk: DiscordSDK): () => void {
	let raf = 0;

	const relayout = () => {
		if (raf) return;
		raf = window.requestAnimationFrame(() => {
			raf = 0;
			window.dispatchEvent(new Event('resize'));
		});
	};

	void sdk.subscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, relayout);
	void sdk.subscribe(Events.ORIENTATION_UPDATE, relayout);

	return () => {
		window.cancelAnimationFrame(raf);
		void sdk.unsubscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, relayout);
		void sdk.unsubscribe(Events.ORIENTATION_UPDATE, relayout);
	};
}
