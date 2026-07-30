import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { ProgressBar } from '../../ui/feedback/ProgressBar';
import { tokens } from '../../ui/theme';

export type PurchaseStatus = 'running' | 'done' | 'error';

export interface PurchaseProgressProps {
	steps: string[];
	activeIndex: number;
	status: PurchaseStatus;
	error?: string | null;
}

function glyph(state: 'done' | 'active' | 'pending' | 'failed'): string {
	if (state === 'done') return '✓';
	if (state === 'failed') return '✕';
	if (state === 'active') return '›';
	return '·';
}

export function PurchaseProgress({
	steps,
	activeIndex,
	status,
	error,
}: PurchaseProgressProps) {
	const total = Math.max(1, steps.length);
	const completed = status === 'done' ? total : Math.max(0, activeIndex);
	const tone =
		status === 'error' ? 'danger' : status === 'done' ? 'success' : 'primary';
	const headline =
		status === 'error'
			? (error ?? 'Purchase failed')
			: status === 'done'
				? 'Purchase complete'
				: (steps[activeIndex] ?? 'Working…');

	return (
		<View
			accessibilityLiveRegion="polite"
			accessibilityLabel={headline}
			style={styles.wrap}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="sm">
					{status === 'running' ? (
						<ActivityIndicator
							size="small"
							color={tokens.color.primary}
						/>
					) : null}
					<Text
						variant="label"
						tone={
							status === 'error'
								? 'danger'
								: status === 'done'
									? 'success'
									: 'default'
						}>
						{headline}
					</Text>
				</Stack>
				<ProgressBar
					value={completed / total}
					tone={tone}
					label={`Step ${Math.min(completed + (status === 'done' ? 0 : 1), total)} of ${total}`}
				/>
				<Stack gap="xs">
					{steps.map((label, i) => {
						const state =
							status === 'error' && i === activeIndex
								? 'failed'
								: i < completed
									? 'done'
									: i === activeIndex && status === 'running'
										? 'active'
										: 'pending';
						return (
							<Stack
								key={label}
								direction="row"
								align="center"
								gap="sm">
								<Text
									variant="caption"
									tone={
										state === 'failed'
											? 'danger'
											: state === 'done'
												? 'success'
												: 'muted'
									}>
									{glyph(state)}
								</Text>
								<Text
									variant="caption"
									tone={state === 'pending' ? 'muted' : 'default'}>
									{label}
								</Text>
							</Stack>
						);
					})}
				</Stack>
			</Stack>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.md,
		backgroundColor: tokens.color.bgSubtle,
		padding: tokens.space.md,
	},
});

export default PurchaseProgress;
