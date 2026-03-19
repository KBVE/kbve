import { registerView } from '../engine';
import { GeneralView } from './general';
import { AudioView } from './audio';
import { ModelsView } from './models';
import { ShortcutsView } from './shortcuts';
import { AboutView } from './about';

// Register all views at import time.
// Order here determines sidebar order.
export function initViews() {
	registerView({
		id: 'general',
		label: 'General',
		icon: '\u2699',
		component: GeneralView,
	});
	registerView({
		id: 'audio',
		label: 'Audio',
		icon: '\uD83C\uDF99',
		component: AudioView,
	});
	registerView({
		id: 'models',
		label: 'Models',
		icon: '\uD83E\uDDE0',
		component: ModelsView,
	});
	registerView({
		id: 'shortcuts',
		label: 'Shortcuts',
		icon: '\u2328',
		component: ShortcutsView,
	});
	registerView({
		id: 'about',
		label: 'About',
		icon: '\u2139',
		component: AboutView,
	});
}
