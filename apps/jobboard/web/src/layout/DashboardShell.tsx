import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import type { TextStyle } from 'react-native';
import {
	Stack,
	PressableSurface,
	Text,
	Button,
	Avatar,
	tokens,
} from '@kbve/rn/ui';
import {
	LayoutDashboard,
	Compass,
	Briefcase,
	MessageSquare,
	User,
	Hexagon,
	Search,
	Bell,
	type LucideIcon,
} from 'lucide-react';
import { useAuth, useAuthActions } from '@kbve/rn/auth';
import { useBreakpoint } from './useBreakpoint';
import { Overview } from './Overview';
import { BrowseView } from './BrowseView';
import { Profile } from './Profile';
import { RightPanel, type Selection } from './RightPanel';
import { WebGpuCanvas } from '../gpu/WebGpuCanvas';
import { auroraGold } from '../gpu/auroraGold';
import { ui } from '../ui/gradients';
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
			case 'profile':
				return <Profile />;
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

	const expanded = !isPhone;

	const brand = (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: tokens.space.sm,
				marginBottom: tokens.space.md,
				paddingHorizontal: tokens.space.xs,
			}}>
			<div
				style={{
					width: 40,
					height: 40,
					borderRadius: 12,
					flexShrink: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'linear-gradient(135deg, #a78bfa, #e879f9)',
					boxShadow: '0 6px 18px rgba(167,139,250,0.35)',
				}}>
				<Hexagon size={20} color="#fff" />
			</div>
			{expanded ? (
				<Text
					variant="subtitle"
					weight="bold"
					style={{ color: ui.text }}>
					KBVE Jobs
				</Text>
			) : null}
		</View>
	);

	const rail = (
		<View style={{ padding: isPhone ? tokens.space.sm : tokens.space.md }}>
			<View
				style={{
					borderRadius: tokens.radius.xl,
					borderWidth: 1,
					borderColor: ui.border,
					backgroundColor: ui.surface,
					padding: tokens.space.sm,
					...(isPhone ? { flexDirection: 'row' } : { width: 208 }),
				}}>
				<Stack
					direction={isPhone ? 'row' : 'column'}
					gap="xs"
					style={{ flex: isPhone ? 1 : undefined }}>
					{expanded ? brand : null}
					{SECTIONS.map((s) => {
						const on = s.id === active;
						const color = on ? ui.purple : ui.textMuted;
						return (
							<PressableSurface
								key={s.id}
								onPress={() => setActive(s.id)}
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									gap: tokens.space.sm,
									height: 44,
									paddingHorizontal: expanded
										? tokens.space.md
										: 0,
									justifyContent: expanded
										? 'flex-start'
										: 'center',
									width: expanded ? undefined : 44,
									flex: isPhone ? 1 : undefined,
									borderRadius: tokens.radius.lg,
									backgroundColor: on
										? 'rgba(167,139,250,0.14)'
										: 'transparent',
								}}>
								<s.Icon size={20} color={color} />
								{expanded ? (
									<Text variant="label" style={{ color }}>
										{s.label}
									</Text>
								) : null}
							</PressableSurface>
						);
					})}
				</Stack>
			</View>
		</View>
	);

	const topbar = (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: tokens.space.md,
				padding: tokens.space.md,
				borderBottomWidth: 1,
				borderBottomColor: ui.border,
			}}>
			<View
				style={{
					flex: 1,
					maxWidth: 380,
					flexDirection: 'row',
					alignItems: 'center',
					gap: tokens.space.sm,
					backgroundColor: ui.surface,
					borderWidth: 1,
					borderColor: ui.border,
					borderRadius: tokens.radius.pill,
					paddingHorizontal: tokens.space.md,
				}}>
				<Search size={16} color={ui.textFaint} />
				<TextInput
					placeholder="Search jobs, people…"
					placeholderTextColor={ui.textFaint}
					style={
						{
							flex: 1,
							color: ui.text,
							paddingVertical: tokens.space.sm,
							outlineStyle: 'none',
						} as unknown as TextStyle
					}
				/>
			</View>
			<View style={{ flex: 1 }} />
			<PressableSurface
				style={{
					width: 40,
					height: 40,
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: tokens.radius.md,
					backgroundColor: ui.surface,
					borderWidth: 1,
					borderColor: ui.border,
				}}>
				<Bell size={18} color={ui.textMuted} />
			</PressableSurface>
			<Stack direction="row" gap="sm" align="center">
				<Avatar name={username} size={36} />
				<Button
					title="Sign out"
					variant="secondary"
					onPress={() => signOut()}
				/>
			</Stack>
		</View>
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
							borderLeftColor: ui.border,
							padding: tokens.space.lg,
						}}>
						{rightPanel}
					</View>
				) : null}
			</View>
		</View>
	);
}
