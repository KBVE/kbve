import { Suspense, createElement, lazy } from 'react';
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
import { DevOpsView } from './devops';
import { DiscordView } from './discord';
import { AboutView } from './about';
import { TerminalView } from './terminal';

// Loaded on demand: pulls the whole @kbve/rn (react-native-web) stack, which
// should never gate app boot.
const ProfileLazy = lazy(() =>
	import('./profile').then((m) => ({ default: m.ProfileView })),
);

function ProfileView() {
	return createElement(
		Suspense,
		{ fallback: null },
		createElement(ProfileLazy),
	);
}

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
		id: 'discord',
		label: 'Discord',
		icon: createElement(IconUser),
		component: DiscordView,
	});
	registerView({
		id: 'devops',
		label: 'DevOps',
		icon: createElement(IconTerminal),
		component: DevOpsView,
	});
	registerView({
		id: 'profile',
		label: 'Profile',
		icon: createElement(IconUser),
		component: ProfileView,
	});
	registerView({
		id: 'about',
		label: 'About',
		icon: createElement(IconInfo),
		component: AboutView,
	});
}
