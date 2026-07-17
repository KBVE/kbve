import { useState } from 'react';
import {
	Gradient,
	Surface,
	Stack,
	Text,
	Button,
	Badge,
	Divider,
	AppBar,
	TabBar,
	tokens,
} from '@kbve/rn-astro';
import type { TabItem } from '@kbve/rn-astro';

const BUTTON_VARIANTS = [
	'primary',
	'secondary',
	'outline',
	'ghost',
	'danger',
] as const;

const NAV_TABS: TabItem[] = [
	{ id: 'home', label: 'Home', icon: 'home' },
	{ id: 'grid', label: 'Apps', icon: 'grid' },
	{ id: 'chat', label: 'Chat', icon: 'chatbubble' },
	{ id: 'sparkles', label: 'Discover', icon: 'sparkles' },
];

export default function RnWebDemo() {
	const [count, setCount] = useState(0);
	const [tab, setTab] = useState('home');

	return (
		<Gradient
			name="hero"
			style={{
				padding: tokens.space.xl,
				borderRadius: tokens.radius.xl,
			}}>
			<Surface style={{ borderRadius: tokens.radius.lg }}>
				<Stack gap="md">
					<Stack
						direction="row"
						align="center"
						justify="space-between">
						<Text variant="title">@kbve/rn on the web</Text>
						<Badge tone="success" label="react-native-web" />
					</Stack>

					<Text tone="muted">
						These are the exact same RN primitives (View / Text /
						Pressable / StyleSheet) the native app renders — aliased
						to react-native-web and hydrated as an Astro island.
					</Text>

					<Stack direction="row" gap="sm" wrap>
						{BUTTON_VARIANTS.map((variant) => (
							<Button
								key={variant}
								variant={variant}
								title={variant}
							/>
						))}
					</Stack>

					<Stack direction="row" align="center" gap="md">
						<Button
							variant="primary"
							title={`Pressed ${count}×`}
							onPress={() => setCount((c) => c + 1)}
						/>
						<Text tone="faint">
							interactive state proves hydration
						</Text>
					</Stack>

					<Divider />

					<Text variant="subtitle">Nav chrome on web</Text>
					<Text tone="muted">
						AppBar + TabBar render via react-native-web with icons
						drawn through react-native-svg (NavIcon.web) — no
						@expo/vector-icons in the web bundle.
					</Text>
					<Surface
						style={{
							borderRadius: tokens.radius.md,
							overflow: 'hidden',
						}}>
						<AppBar title="KBVE" subtitle="react-native-web nav" />
						<TabBar
							tabs={NAV_TABS}
							active={tab}
							onTabPress={setTab}
						/>
					</Surface>
					<Text tone="faint">active tab: {tab}</Text>
				</Stack>
			</Surface>
		</Gradient>
	);
}
