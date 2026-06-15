import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import {
	Stack,
	Surface,
	PressableSurface,
	Text,
	Button,
	tokens,
} from '@kbve/rn/ui';
import {
	LayoutDashboard,
	Compass,
	Briefcase,
	MessageSquare,
	User,
	type LucideIcon,
} from 'lucide-react';
import { useAuth, useAuthActions } from '@kbve/rn/auth';
import { useBreakpoint } from './useBreakpoint';
import { Overview } from './Overview';
import { BrowseView } from './BrowseView';
import { RightPanel, type Selection } from './RightPanel';
import type { Vertical } from '../api/client';

const SECTIONS: { id: string; label: string; Icon: LucideIcon }[] = [
	{ id: 'overview', label: 'Overview', Icon: LayoutDashboard },
	{ id: 'browse', label: 'Browse', Icon: Compass },
	{ id: 'jobs', label: 'My Jobs', Icon: Briefcase },
	{ id: 'messages', label: 'Messages', Icon: MessageSquare },
	{ id: 'profile', label: 'Profile', Icon: User },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function DashboardShell() {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	const { isDesktop, isPhone } = useBreakpoint();
	const [active, setActive] = useState<SectionId>('overview');
	const [selection, setSelection] = useState<Selection>(null);

	const username = auth.user?.username ?? auth.user?.email ?? 'there';

	const selectVertical = (v: Vertical) =>
		setSelection({ kind: 'vertical', vertical: v });

	const main = () => {
		switch (active) {
			case 'overview':
				return <Overview username={username} />;
			case 'browse':
				return (
					<BrowseView
						selectedId={
							selection?.kind === 'vertical'
								? selection.vertical.id
								: undefined
						}
						onSelect={selectVertical}
					/>
				);
			default:
				return (
					<Stack gap="sm">
						<Text variant="title">
							{SECTIONS.find((s) => s.id === active)?.label}
						</Text>
						<Text tone="muted">Coming soon.</Text>
					</Stack>
				);
		}
	};

	const rail = (
		<Surface
			style={{
				borderRadius: 0,
				...(isPhone
					? {
							flexDirection: 'row',
							borderBottomWidth: 1,
							borderBottomColor: tokens.color.border,
						}
					: {
							width: 76,
							borderRightWidth: 1,
							borderRightColor: tokens.color.border,
						}),
			}}>
			<Stack
				direction={isPhone ? 'row' : 'column'}
				gap="xs"
				align="center"
				style={{
					padding: tokens.space.sm,
					flex: isPhone ? 1 : undefined,
				}}>
				{SECTIONS.map((s) => {
					const on = s.id === active;
					return (
						<PressableSurface
							key={s.id}
							onPress={() => setActive(s.id)}
							style={{
								width: 48,
								height: 48,
								alignItems: 'center',
								justifyContent: 'center',
								borderRadius: tokens.radius.md,
								backgroundColor: on
									? tokens.color.surfaceAlt
									: 'transparent',
							}}>
							<s.Icon
								size={20}
								color={
									on
										? tokens.color.primary
										: tokens.color.textMuted
								}
							/>
						</PressableSurface>
					);
				})}
			</Stack>
		</Surface>
	);

	const topbar = (
		<Surface
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: tokens.space.md,
				padding: tokens.space.md,
				borderBottomWidth: 1,
				borderBottomColor: tokens.color.border,
				borderRadius: 0,
			}}>
			<TextInput
				placeholder="Search jobs…"
				placeholderTextColor={tokens.color.textFaint}
				style={{
					flex: 1,
					maxWidth: 360,
					color: tokens.color.text,
					backgroundColor: tokens.color.surfaceAlt,
					borderRadius: tokens.radius.pill,
					paddingHorizontal: tokens.space.md,
					paddingVertical: tokens.space.sm,
				}}
			/>
			<View style={{ flex: 1 }} />
			<Text variant="label">@{username}</Text>
			<Button
				title="Sign out"
				variant="secondary"
				onPress={() => signOut()}
			/>
		</Surface>
	);

	const rightPanel = <RightPanel selection={selection} />;

	return (
		<View
			style={{
				flex: 1,
				flexDirection: isPhone ? 'column' : 'row',
				backgroundColor: tokens.color.bg,
			}}>
			{rail}
			<View style={{ flex: 1, flexDirection: 'column' }}>
				{topbar}
				<ScrollView
					style={{ flex: 1 }}
					contentContainerStyle={{
						padding: tokens.space.xl,
						gap: tokens.space.xl,
					}}>
					{main()}
					{!isDesktop ? (
						<View style={{ minHeight: 280 }}>{rightPanel}</View>
					) : null}
				</ScrollView>
			</View>
			{isDesktop ? (
				<View
					style={{
						width: 340,
						borderLeftWidth: 1,
						borderLeftColor: tokens.color.border,
						padding: tokens.space.lg,
					}}>
					{rightPanel}
				</View>
			) : null}
		</View>
	);
}
