import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
	Stack,
	Surface,
	PressableSurface,
	Text,
	Button,
	tokens,
} from '@kbve/rn/ui';
import { useAuth, useAuthActions } from '@kbve/rn/auth';
import { BrowseView } from './BrowseView';

interface Section {
	id: string;
	label: string;
	icon: string;
	render: () => ReactNode;
}

const SECTIONS: Section[] = [
	{ id: 'browse', label: 'Browse', icon: '🧭', render: () => <BrowseView /> },
	{
		id: 'jobs',
		label: 'My Jobs',
		icon: '📋',
		render: () => <Placeholder title="My Jobs" />,
	},
	{
		id: 'messages',
		label: 'Messages',
		icon: '💬',
		render: () => <Placeholder title="Messages" />,
	},
	{
		id: 'profile',
		label: 'Profile',
		icon: '👤',
		render: () => <Placeholder title="Profile" />,
	},
];

function Placeholder({ title }: { title: string }) {
	return (
		<Stack gap="sm">
			<Text variant="title">{title}</Text>
			<Text tone="muted">Coming soon.</Text>
		</Stack>
	);
}

export function DashboardShell() {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	const [active, setActive] = useState('browse');
	const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

	return (
		<View
			style={{
				flex: 1,
				flexDirection: 'row',
				backgroundColor: tokens.color.bg,
			}}>
			{/* Rail */}
			<Surface
				style={{
					width: 232,
					borderRightWidth: 1,
					borderRightColor: tokens.color.border,
					borderRadius: 0,
				}}>
				<Stack gap="lg" style={{ padding: tokens.space.lg, flex: 1 }}>
					<Text variant="subtitle" weight="bold">
						KBVE Jobs
					</Text>
					<Stack gap="xs">
						{SECTIONS.map((s) => {
							const on = s.id === active;
							return (
								<PressableSurface
									key={s.id}
									onPress={() => setActive(s.id)}
									style={{
										padding: tokens.space.sm,
										borderRadius: tokens.radius.md,
										backgroundColor: on
											? tokens.color.surfaceAlt
											: 'transparent',
									}}>
									<Stack
										direction="row"
										gap="sm"
										align="center">
										<Text>{s.icon}</Text>
										<Text
											variant="label"
											tone={on ? 'primary' : 'muted'}>
											{s.label}
										</Text>
									</Stack>
								</PressableSurface>
							);
						})}
					</Stack>
				</Stack>
			</Surface>

			{/* Main column */}
			<View style={{ flex: 1, flexDirection: 'column' }}>
				{/* Top nav */}
				<Surface
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						padding: tokens.space.md,
						borderBottomWidth: 1,
						borderBottomColor: tokens.color.border,
						borderRadius: 0,
					}}>
					<Text variant="label" tone="muted">
						{section.label}
					</Text>
					<View style={{ flex: 1 }} />
					<Stack direction="row" gap="md" align="center">
						<Text variant="label">
							@
							{auth.user?.username ?? auth.user?.email ?? 'guest'}
						</Text>
						<Button
							title="Sign out"
							variant="secondary"
							onPress={() => signOut()}
						/>
					</Stack>
				</Surface>

				{/* Content */}
				<View style={{ flex: 1, padding: tokens.space.xl }}>
					{section.render()}
				</View>

				{/* Footer */}
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						gap: tokens.space.md,
						paddingHorizontal: tokens.space.xl,
						paddingVertical: tokens.space.md,
						borderTopWidth: 1,
						borderTopColor: tokens.color.border,
					}}>
					<Text variant="caption" tone="faint">
						© KBVE
					</Text>
					<Text variant="caption" tone="faint">
						·
					</Text>
					<Text variant="caption" tone="faint">
						jobs.kbve.com
					</Text>
				</View>
			</View>
		</View>
	);
}
