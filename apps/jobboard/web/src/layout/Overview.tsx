import { View } from 'react-native';
import { Stack, Text, Badge, tokens } from '@kbve/rn/ui';
import { FileText, Users, Sparkles, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { Sparkline } from '../ui/Sparkline';

const TREND = [12, 18, 14, 22, 19, 28, 24, 33, 30, 38, 42, 39];

function StatCard({
	label,
	value,
	delta,
	Icon,
	series,
}: {
	label: string;
	value: string;
	delta: string;
	Icon: LucideIcon;
	series: number[];
}) {
	return (
		<Panel style={{ flex: 1, minWidth: 180, gap: tokens.space.sm }}>
			<Stack direction="row" justify="space-between" align="center">
				<Stack direction="row" gap="sm" align="center">
					<Icon size={16} color={tokens.color.primary} />
					<Text variant="caption" tone="muted">
						{label}
					</Text>
				</Stack>
				<Badge label={delta} tone="success" />
			</Stack>
			<Text variant="title" weight="bold">
				{value}
			</Text>
			<div style={{ marginTop: 2, opacity: 0.9 }}>
				<Sparkline data={series} height={36} strokeWidth={1.5} />
			</div>
		</Panel>
	);
}

export function Overview({ username }: { username: string }) {
	return (
		<Stack gap="lg">
			{/* Hero */}
			<Panel gradient="hero" glow radius={24} pad={28}>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: tokens.space.lg,
					}}>
					<Stack gap="xs" style={{ flex: 1 }}>
						<Stack direction="row" gap="sm" align="center">
							<Sparkles size={18} color={tokens.color.primary} />
							<Text variant="label" tone="primary">
								Welcome back
							</Text>
						</Stack>
						<Text variant="display" weight="bold">
							Hello {username}!
						</Text>
						<Text variant="body" tone="muted">
							You have new matches. Your profile is trending up
							this week.
						</Text>
					</Stack>
					<div
						style={{
							width: 96,
							height: 96,
							borderRadius: 24,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background:
								'radial-gradient(circle at 30% 30%, rgba(201,165,106,0.45), rgba(201,165,106,0.05))',
							border: '1px solid rgba(201,165,106,0.25)',
						}}>
						<TrendingUp size={40} color={tokens.color.primary} />
					</div>
				</View>
			</Panel>

			{/* Chart */}
			<Panel pad={24}>
				<Stack direction="row" justify="space-between" align="center">
					<Stack gap="xs">
						<Text variant="label">Activity</Text>
						<Text variant="caption" tone="faint">
							Applications over the last 12 weeks
						</Text>
					</Stack>
					<Badge label="+18%" tone="success" />
				</Stack>
				<div style={{ marginTop: tokens.space.md }}>
					<Sparkline data={TREND} height={180} />
				</div>
			</Panel>

			{/* Stats */}
			<View
				style={{
					flexDirection: 'row',
					flexWrap: 'wrap',
					gap: tokens.space.md,
				}}>
				<StatCard
					label="Applications"
					value="23"
					delta="+8%"
					Icon={FileText}
					series={[8, 10, 9, 12, 14, 13, 18, 23]}
				/>
				<StatCard
					label="Matches"
					value="46"
					delta="+15%"
					Icon={Users}
					series={[20, 22, 28, 26, 34, 38, 41, 46]}
				/>
				<StatCard
					label="Responses"
					value="12"
					delta="+4%"
					Icon={Sparkles}
					series={[4, 6, 5, 8, 7, 9, 10, 12]}
				/>
			</View>
		</Stack>
	);
}
