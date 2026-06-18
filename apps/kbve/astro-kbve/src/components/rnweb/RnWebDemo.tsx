import { useState } from 'react';
import {
	Gradient,
	Surface,
	Stack,
	Text,
	Button,
	Badge,
	tokens,
} from '@kbve/rn-astro';

const BUTTON_VARIANTS = [
	'primary',
	'secondary',
	'outline',
	'ghost',
	'danger',
] as const;

export default function RnWebDemo() {
	const [count, setCount] = useState(0);

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
						<Badge tone="success">react-native-web</Badge>
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
				</Stack>
			</Surface>
		</Gradient>
	);
}
