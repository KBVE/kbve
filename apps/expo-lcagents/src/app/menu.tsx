import { ChevronDown } from '@tamagui/lucide-icons';
import { Accordion, Paragraph, Square, Stack, View } from 'tamagui';
import { XStack, YStack } from 'tamagui';

interface AccordionTriggerProps {
	open: boolean;
}

export function AccordionDemo() {
	return (
		<Accordion overflow="hidden" width="$20" type="multiple">
			<Accordion.Item value="a1">
				<Accordion.Trigger
					flexDirection="row"
					justifyContent="space-between">
					{({ open }: AccordionTriggerProps) => (
						<>
							<Paragraph>Menu</Paragraph>
							<Square
								animation="quick"
								rotate={open ? '180deg' : '0deg'}>
								<ChevronDown size="$1" />
							</Square>
						</>
					)}
				</Accordion.Trigger>
				<Accordion.Content>
					<Paragraph>
						Cold showers can help reduce inflammation, relieve pain,
						improve circulation, lower stress levels, and reduce
						muscle soreness and fatigue.
					</Paragraph>
				</Accordion.Content>
			</Accordion.Item>

			<Accordion.Item value="a2">
				<Accordion.Trigger
					flexDirection="row"
					justifyContent="space-between">
					{({ open }: AccordionTriggerProps) => (
						<>
							<Paragraph>Socials</Paragraph>
							<Square
								animation="quick"
								rotate={open ? '180deg' : '0deg'}>
								<ChevronDown size="$1" />
							</Square>
						</>
					)}
				</Accordion.Trigger>
				<Accordion.Content>
					<Paragraph>
						Place holder here for socials and just to trigger the build!
					</Paragraph>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion>
	);
}

const ModalScreen = () => {
	return (
		<View>
			<YStack
				flex={1}
				space="$2"
				borderWidth={2}
				borderColor="$color"
				borderRadius="$4"
				padding="$2"
				alignItems="center" // Center children horizontally in the cross axis (since YStack is a vertical stack)
				justifyContent="center" // Center children vertically in the main axis
			>
				<AccordionDemo />
			</YStack>
		</View>
	);
};

export default ModalScreen;
