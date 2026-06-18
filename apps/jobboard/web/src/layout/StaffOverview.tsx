import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, Text, Button, tokens } from '@kbve/rn/ui';
import { ShieldCheck, Users, ClipboardList } from 'lucide-react';
import { fetchAdminApplications } from '../api/client';
import { Panel } from '../ui/Panel';
import { ui } from '../ui/gradients';

// Staff landing: the vetting queue at a glance + a jump into it. Distinct from
// the member Overview (marketplace stats). Shown to staff via DashboardShell.
export function StaffOverview({
	username,
	canVet,
	onGoVetting,
}: {
	username: string;
	canVet: boolean;
	onGoVetting: () => void;
}) {
	const { data } = useQuery({
		queryKey: ['admin-applications'],
		queryFn: fetchAdminApplications,
		enabled: canVet,
	});
	const pending = data?.applications.length ?? 0;

	return (
		<Stack gap="lg">
			<Panel gradient="hero" glow radius={24} pad={28}>
				<Stack direction="row" align="center" gap="md">
					<div
						style={{
							width: 56,
							height: 56,
							borderRadius: 16,
							flexShrink: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background:
								'linear-gradient(135deg, #a78bfa, #e879f9)',
						}}>
						<ShieldCheck size={26} color="#fff" />
					</div>
					<Stack gap="xs" style={{ flex: 1 }}>
						<Text
							variant="display"
							weight="bold"
							style={{ color: '#fff' }}>
							Staff console
						</Text>
						<Text
							variant="body"
							style={{ color: 'rgba(255,255,255,0.85)' }}>
							Welcome {username} — you're signed in as staff.
						</Text>
					</Stack>
				</Stack>
			</Panel>

			{canVet ? (
				<Panel radius={20} pad={24}>
					<Stack direction="row" align="center" gap="md">
						<ClipboardList size={22} color={ui.purple} />
						<Stack gap="xs" style={{ flex: 1 }}>
							<Text variant="subtitle" weight="bold">
								Vetting queue
							</Text>
							<Text tone="muted">
								{pending === 0
									? 'No applications waiting for review.'
									: `${pending} application${pending === 1 ? '' : 's'} waiting for review.`}
							</Text>
						</Stack>
						<Button
							title={pending > 0 ? `Review (${pending})` : 'Open'}
							onPress={onGoVetting}
						/>
					</Stack>
				</Panel>
			) : (
				<Panel radius={20} pad={24}>
					<Stack direction="row" align="center" gap="md">
						<Users size={22} color={ui.textMuted} />
						<Text tone="muted" style={{ flex: 1 }}>
							You don't have vetting permission. Ask an admin for
							the ADMIN or DASHBOARD_MANAGE capability.
						</Text>
					</Stack>
				</Panel>
			)}

			<View style={{ height: tokens.space.sm }} />
		</Stack>
	);
}
