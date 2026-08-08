import { Component, Suspense, createElement, lazy } from 'react';
import type { ReactNode } from 'react';
import { registerView } from '../engine';
import {
	IconSettings,
	IconMic,
	IconCpu,
	IconTerminal,
	IconUser,
} from '../components/Icons';
import { GeneralView } from './general';
import { AudioView } from './audio';
import { ModelsView } from './models';
import { DevOpsView } from './devops';
import { DiscordView } from './discord';

// Loaded on demand: pulls the whole @kbve/rn (react-native-web) stack, which
// should never gate app boot — a load failure renders an inline notice
// instead of unmounting the app.
const ProfileLazy = lazy(() =>
	import('./profile').then((m) => ({ default: m.ProfileView })),
);

class ProfileBoundary extends Component<
	{ children: ReactNode },
	{ error: string | null }
> {
	state = { error: null };

	static getDerivedStateFromError(error: unknown) {
		return { error: String(error) };
	}

	render() {
		if (this.state.error) {
			return createElement(
				'div',
				{
					style: {
						color: 'var(--color-text-muted)',
						padding: '2rem',
						font: '12px monospace',
						whiteSpace: 'pre-wrap',
					},
				},
				'Profile view failed to load:\n' + this.state.error,
			);
		}
		return this.props.children;
	}
}

function ProfileView() {
	return createElement(
		ProfileBoundary,
		null,
		createElement(Suspense, { fallback: null }, createElement(ProfileLazy)),
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
		hidden: true,
	});
}
