import { createElement } from 'react';
import { registerView } from '../engine';
import {
	IconSettings,
	IconMic,
	IconCpu,
	IconKeyboard,
	IconInfo,
} from '../components/Icons';
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
		icon: createElement(IconSettings),
		component: GeneralView,
	});
	registerView({
		id: 'audio',
		label: 'Audio',
		icon: createElement(IconMic),
		component: AudioView,
	});
	registerView({
		id: 'models',
		label: 'Models',
		icon: createElement(IconCpu),
		component: ModelsView,
	});
	registerView({
		id: 'shortcuts',
		label: 'Shortcuts',
		icon: createElement(IconKeyboard),
		component: ShortcutsView,
	});
	registerView({
		id: 'about',
		label: 'About',
		icon: createElement(IconInfo),
		component: AboutView,
	});
}
