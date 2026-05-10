import { createRoot } from 'react-dom/client';
import ReactSolitaireApp from '../../src/arcade/solitaire/ReactSolitaireApp';
import npcdb from './npcdb-snapshot.json';

const MOUNT_ID = 'kbve-solitaire-root';
const STYLE_ID = 'kbve-solitaire-style';
const STYLES = `#${MOUNT_ID}{position:relative;width:100%;height:100%;min-height:100vh;background:#0a0a0f;color:#eee;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}#${MOUNT_ID} canvas{display:block;margin:0 auto}`;

(
	globalThis as { __SOLITAIRE_INLINE_NPCDB__?: unknown }
).__SOLITAIRE_INLINE_NPCDB__ = npcdb;

if (!document.getElementById(STYLE_ID)) {
	const styleEl = document.createElement('style');
	styleEl.id = STYLE_ID;
	styleEl.textContent = STYLES;
	document.head.appendChild(styleEl);
}

let container =
	document.getElementById(MOUNT_ID) ?? document.getElementById('root');
if (!container) {
	container = document.createElement('div');
	container.id = MOUNT_ID;
	document.body.appendChild(container);
}
createRoot(container).render(<ReactSolitaireApp />);
