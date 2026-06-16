import { View } from 'react-native';
import { Stack, Text, Badge, tokens } from '@kbve/rn/ui';
import { TrendingUp, Sparkles } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { AreaChart } from '../ui/AreaChart';
import { Sparkline } from '../ui/Sparkline';
import { Bars } from '../ui/Bars';

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];
const SERIES = [2.1, 2.6, 2.3, 3.1, 2.8, 3.6, 3.2, 4.0, 3.7, 4.4, 4.1, 4.7];
const ACTIVITY = [4, 7, 5, 9, 6, 8, 5];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
						<Text variant="display" weight="bold">
							Hello {username}!
						</Text>
						<Text variant="body" tone="muted">
							You have new matches this week. Your success rate is
							up 7% — you're on the right track toward your goal.
						</Text>
					</Stack>
					<div
						style={{
							width: 120,
							height: 120,
							borderRadius: 28,
							flexShrink: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background:
								'radial-gradient(circle at 30% 30%, rgba(201,165,106,0.5), rgba(201,165,106,0.05))',
							border: '1px solid rgba(201,165,106,0.25)',
						}}>
						<TrendingUp size={52} color={tokens.color.primary} />
					</div>
				</View>
			</Panel>

			{/* Chart */}
			<Panel pad={24}>
				<Stack direction="row" justify="space-between" align="center">
					<Stack gap="xs">
						<Text variant="label">Statistics</Text>
						<Text variant="caption" tone="faint">
							Applications over the last 12 months
						</Text>
					</Stack>
					<Badge label="+18%" tone="success" />
				</Stack>
				<div style={{ marginTop: tokens.space.md }}>
					<AreaChart data={SERIES} labels={MONTHS} unit="k" />
				</div>
			</Panel>

			{/* Bottom row */}
			<View
				style={{
					flexDirection: 'row',
					flexWrap: 'wrap',
					gap: tokens.space.md,
				}}>
				<Panel style={{ flex: 1, minWidth: 200, gap: tokens.space.sm }}>
					<Stack
						direction="row"
						justify="space-between"
						align="center">
						<Text variant="caption" tone="muted">
							Monthly income
						</Text>
						<Badge label="+8%" tone="success" />
					</Stack>
					<Text variant="display" weight="bold">
						$23,249
					</Text>
				</Panel>

				<Panel style={{ flex: 1, minWidth: 200, gap: tokens.space.sm }}>
					<Stack
						direction="row"
						justify="space-between"
						align="center">
						<Text variant="caption" tone="muted">
							Leads
						</Text>
						<Badge label="+15%" tone="success" />
					</Stack>
					<Stack
						direction="row"
						justify="space-between"
						align="center">
						<Text variant="display" weight="bold">
							46
						</Text>
						<div style={{ width: 90 }}>
							<Sparkline
								data={[20, 28, 24, 34, 30, 41, 46]}
								height={36}
								strokeWidth={1.5}
							/>
						</div>
					</Stack>
				</Panel>

				<Panel style={{ flex: 1, minWidth: 220, gap: tokens.space.sm }}>
					<Stack
						direction="row"
						justify="space-between"
						align="center">
						<Stack direction="row" gap="sm" align="center">
							<Sparkles size={14} color={tokens.color.primary} />
							<Text variant="caption" tone="muted">
								Activity
							</Text>
						</Stack>
						<Badge label="Week" />
					</Stack>
					<Bars data={ACTIVITY} labels={DAYS} height={96} />
				</Panel>
			</View>
		</Stack>
	);
}
