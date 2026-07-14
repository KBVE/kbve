import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initObserv } from '@kbve/observ';
import ReactIsoArpgApp from './game/ReactIsoArpgApp';
import { setArpgAssetBase } from './game/config';

initObserv({
	endpoint: 'https://metrics.kbve.com/api/v1/ingest/errors',
	project: 'arpg',
	platform: 'web',
	environment: import.meta.env.MODE,
});

// Assets (sprites, tilesets) are served from this app's public dir at the site
// root, the same `/assets/arcade/arpg/...` layout the astro build uses.
setArpgAssetBase('');

// ReactIsoArpgApp mounts Phaser into '#iso-arpg-inner'. No embedSession here:
// the standalone app runs the real Supabase login (buildNetConfig -> AuthBridge)
// so a signed-in session JWT authenticates against the local arpg-server.
const host = document.getElementById('root')!;
const wrapper = document.createElement('div');
wrapper.id = 'iso-arpg-inner';
wrapper.style.cssText = 'position:relative;width:100%;height:100%';
host.appendChild(wrapper);

createRoot(wrapper).render(
	<StrictMode>
		<ReactIsoArpgApp />
	</StrictMode>,
);
