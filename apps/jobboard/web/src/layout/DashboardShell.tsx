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
	Hexagon,
	type LucideIcon,
} from 'lucide-react';
import { useAuth, useAuthActions } from '@kbve/rn/auth';
import { useBreakpoint } from './useBreakpoint';
import { Overview } from './Overview';
import { BrowseView } from './BrowseView';
import { RightPanel, type Selection } from './RightPanel';
import { WebGpuCanvas } from '../gpu/WebGpuCanvas';
import { auroraGold } from '../gpu/auroraGold';
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

	const brand = (
		<div
			style={{
				width: 44,
				height: 44,
				borderRadius: 14,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background:
					'linear-gradient(135deg, rgba(201,165,106,0.9), rgba(166,125,67,0.7))',
				boxShadow: '0 6px 18px rgba(201,165,106,0.25)',
			}}>
			<Hexagon size={22} color={tokens.color.onPrimary} />
		</div>
	);

	const rail = (
		<View
			style={{
				padding: isPhone ? tokens.space.sm : tokens.space.md,
			}}>
			<Surface
				style={{
					borderRadius: tokens.radius.xl,
					borderWidth: 1,
					borderColor: tokens.color.border,
					...(isPhone ? { flexDirection: 'row' } : {}),
				}}>
				<Stack
					direction={isPhone ? 'row' : 'column'}
					gap="xs"
					align="center"
					style={{
						padding: tokens.space.sm,
						flex: isPhone ? 1 : undefined,
					}}>
					{!isPhone ? (
						<View style={{ marginBottom: tokens.space.sm }}>
							{brand}
						</View>
					) : null}
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
									borderRadius: tokens.radius.lg,
									borderWidth: 1,
									borderColor: on
										? 'rgba(201,165,106,0.35)'
										: 'transparent',
									backgroundColor: on
										? 'rgba(201,165,106,0.14)'
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
		</View>
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
		<View style={{ flex: 1 }}>
			<WebGpuCanvas effect={auroraGold} />
			<View
				style={{
					flex: 1,
					flexDirection: isPhone ? 'column' : 'row',
					backgroundColor: 'transparent',
					zIndex: 1,
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
		</View>
	);
}
