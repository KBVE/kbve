import { createElement } from 'react';
import { registerView } from '../engine';
import {
	IconSettings,
	IconMic,
	IconCpu,
	IconKeyboard,
	IconInfo,
	IconTerminal,
	IconUser,
} from '../components/Icons';
import { GeneralView } from './general';
import { AudioView } from './audio';
import { ModelsView } from './models';
import { ShortcutsView } from './shortcuts';
import { OnichanView } from './onichan';
import { AboutView } from './about';
import { TerminalView } from './terminal';

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
		id: 'terminal',
		label: 'Terminal',
		icon: createElement(IconTerminal),
		component: TerminalView,
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
		id: 'onichan',
		label: 'Onichan',
		icon: createElement(IconUser),
		component: OnichanView,
	});
	registerView({
		id: 'about',
		label: 'About',
		icon: createElement(IconInfo),
		component: AboutView,
	});
}
