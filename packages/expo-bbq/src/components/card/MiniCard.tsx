import React, { memo } from 'react';
import { YStack, XStack, SizableText, Image, Card, Button, Popover, Adapt } from 'tamagui';
import { HelpCircle, Info } from '@tamagui/lucide-icons';

interface MiniCardProps {
	title: string;
	description: string;
	image?: string;
	info?: { content: string };
	help?: { content: string };
}

export const MiniCard = memo(function MiniCard({ title, description, image, info, help }: MiniCardProps) {
	return (
		<Card padding="$4" borderRadius="$4" shadowColor={'cyan'} shadowRadius={8} gap="$2" backgroundColor="$background">

         
            {/* Optional Image */}
			{image && (
				<Image
					source={{ uri: image }}
					width={350}
					height={200}
					borderRadius="$2"
					marginTop="$3"
                    objectFit='cover'
                    $gtSm={{
                        width: '100%',
                        gap: '$8',
                    }}
				/>
			)}

			<YStack gap="$2">
            
				<XStack justifyContent="space-between" alignItems="center">
                    
					<SizableText size="$6" fontWeight="700">
						{title}
					</SizableText>

					{/* Corner Help Icons */}
					<XStack gap="$2">
						{info && <PopoverButton icon={Info} content={info.content} />}
						{help && <PopoverButton icon={HelpCircle} content={help.content} />}
					</XStack>
				</XStack>

				<SizableText size="$4" color="$gray11">
					{description}
				</SizableText>
			</YStack>

			
		</Card>
	);
});

// Popover Button Component for Icons
function PopoverButton({ icon: Icon, content }: { icon: any; content: string }) {
	return (
		<Popover size="$5">
			<Popover.Trigger asChild>
				<Button icon={Icon} size="$2" />
			</Popover.Trigger>
			<Adapt platform="touch">
				<Popover.Sheet modal dismissOnSnapToBottom>
					<Popover.Sheet.Frame padding="$4">
						<Adapt.Contents />
					</Popover.Sheet.Frame>
				</Popover.Sheet>
			</Adapt>

			<Popover.Content
				borderWidth={1}
				borderColor="$borderColor"
				enterStyle={{ y: -10, opacity: 0 }}
				exitStyle={{ y: -10, opacity: 0 }}
				elevate
				animation={['quick', { opacity: { overshootClamping: true } }]}>
				<Popover.Arrow borderWidth={1} borderColor="$borderColor" />
				<YStack gap="$3" padding="$2">
					<SizableText>{content}</SizableText>
					<Popover.Close asChild>
						<Button size="$3">Close</Button>
					</Popover.Close>
				</YStack>
			</Popover.Content>
		</Popover>
	);
}
