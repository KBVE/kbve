import { AdCard, type AdCreative, pickAd } from '@kbve/laser';
import { getExternalOpener } from '../lib/external';

// ARPG-side cross-promo creatives. The render + rotation live in @kbve/laser, so
// promoting another title later is just another entry in this pool — no new code.
// Shown on the boot/loading screen for both surfaces (kbve.com/arcade/arpg embed
// and the Discord Activity), since both mount ReactIsoArpgApp -> ArpgBootOverlay.
const ARPG_ADS: AdCreative[] = [
	{
		id: 'chuckrpg',
		eyebrow: 'While you wait',
		title: 'Play our MMO —',
		highlight: 'ChuckRPG',
		body: 'Open-world co-op adventure. Click to play →',
		url: 'https://kbve.itch.io/chuckrpg',
		icon: '⚔️',
	},
];

export default function ArpgChuckAd() {
	const creative = pickAd(ARPG_ADS);
	if (!creative) return null;
	// In the Discord Activity an opener is registered; route the click through the
	// embedded SDK. On the plain web embed it's null, so AdCard's native anchor
	// (target="_blank") opens a new tab.
	const opener = getExternalOpener();
	return (
		<AdCard
			creative={creative}
			onOpen={opener ? (c) => opener(c.url) : undefined}
			style={{ marginTop: '10px' }}
		/>
	);
}
