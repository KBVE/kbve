import { StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Avatar } from '../ui/primitives/Avatar';
import { Skeleton } from '../ui/feedback/Skeleton';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../auth/useStaff';

export function ProfileHeader() {
	const auth = useAuth();
	const staff = useStaff();

	if (auth.loading) {
		return (
			<Surface>
				<Stack direction="row" gap="md" align="center">
					<Skeleton width={56} height={56} radius={28} />
					<Stack gap="xs" style={styles.grow}>
						<Skeleton width={140} height={18} />
						<Skeleton width={90} height={13} />
					</Stack>
				</Stack>
			</Surface>
		);
	}

	const username = auth.username ?? 'you';
	const email = auth.user?.email ?? undefined;

	return (
		<Surface>
			<Stack direction="row" gap="md" align="center">
				<Avatar name={username} size={56} />
				<Stack gap="xs" style={styles.grow}>
					<Stack direction="row" gap="sm" align="center" wrap>
						<Text variant="subtitle">@{username}</Text>
						{staff.isStaff ? (
							<Badge tone="warning" label="Staff" />
						) : null}
					</Stack>
					{email ? (
						<Text variant="caption" tone="muted">
							{email}
						</Text>
					) : null}
				</Stack>
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	grow: { flexShrink: 1 },
});
