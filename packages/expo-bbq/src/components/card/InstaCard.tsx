import React, { memo, useCallback } from 'react';
import {
	YStack,
	XStack,
	SizableText,
	Image,
	Input,
	Button,
	Avatar,
	Separator,
	PopoverProps,
	Popover,
	Adapt,
} from 'tamagui';
import {
	Heart,
	MessageCircle,
	Bookmark,
	Share2,
	MoreVertical,
} from '@tamagui/lucide-icons';

interface PopoverDemoProps extends PopoverProps {
	Icon?: any;
	Name?: string;
	shouldAdapt?: boolean;
	onAction: (actionState: string, content: string) => void;
}

interface InstaCardProps {
	username: string;
	location: string;
	avatarUrl: string;
	postImageUrl: string;
	likes: Array<{ avatarUrl: string; name: string }>;
	caption: string;
	ulid: string;
	onAction: (actionState: string, content: string) => void;
}

// Memoizing InstaCard to avoid unnecessary re-renders
export const InstaCard = memo(function InstaCard({
	username,
	location,
	avatarUrl,
	postImageUrl,
	likes,
	caption,
	ulid,
	onAction,
}: InstaCardProps) {
	const handleAction = useCallback(
		(actionState: string, content: string) => {
			onAction(actionState, content);
		},
		[onAction], // Ensures the callback only changes if onAction changes
	);

	return (
		<YStack
			width={400}
			backgroundColor="$background"
			borderRadius="$4"
			shadowColor="$shadowColor"
			shadowOffset={{ width: 0, height: 4 }}
			shadowOpacity={0.1}
			shadowRadius={20}>
			{/* Header */}
			<XStack justifyContent="space-between" padding="$3">
				<XStack alignItems="center" gap="$2">
					<Avatar circular size="$3">
						<Avatar.Image
							source={{ uri: avatarUrl }}
							width="100%"
							height="100%"
						/>
					</Avatar>
					<YStack>
						<SizableText fontWeight="600" fontSize="$2">
							{username}
						</SizableText>
						<SizableText fontSize="$1" color="$gray10">
							{location}
						</SizableText>
					</YStack>
				</XStack>

				{/* Popover Button */}
				<PopoverDemo
					placement="bottom"
					Icon={MoreVertical}
					Name="options-popover"
					onAction={handleAction}
				/>
			</XStack>

			{/* Image */}
			<Image
				source={{ uri: postImageUrl }}
				width="100%"
				height={300}
				borderRadius="$2"
			/>

			{/* Action Buttons */}
			<XStack
				padding="$3"
				justifyContent="space-between"
				alignItems="center">
				<XStack gap="$3">
					<PopoverDemo
						placement="bottom"
						Icon={Heart}
						Name="like-popover"
						onAction={handleAction}
					/>
					<PopoverDemo
						placement="bottom"
						Icon={MessageCircle}
						Name="comment-popover"
						onAction={handleAction}
					/>
					<PopoverDemo
						placement="bottom"
						Icon={Share2}
						Name="share-popover"
						onAction={handleAction}
					/>
				</XStack>
				<PopoverDemo
					placement="bottom"
					Icon={Bookmark}
					Name="bookmark-popover"
					onAction={handleAction}
				/>
			</XStack>

			{/* Likes Section */}
			<XStack paddingHorizontal="$3" gap="$2" alignItems="center">
				{likes.map((like, index) => (
					<Avatar key={index} circular size="$2">
						<Avatar.Image
							source={{ uri: like.avatarUrl }}
							width="100%"
							height="100%"
						/>
					</Avatar>
				))}
				<SizableText fontSize="$2">
					Liked by{' '}
					<SizableText fontWeight="600">{likes[0]?.name}</SizableText>{' '}
					and{' '}
					<SizableText fontWeight="600">
						{likes.length} others
					</SizableText>
				</SizableText>
			</XStack>

			{/* Caption */}
			<YStack paddingHorizontal="$3" paddingVertical="$2">
				<SizableText fontSize="$2">
					<SizableText fontWeight="600">{username} </SizableText>
					{caption}
				</SizableText>
			</YStack>

			{/* Comment Input */}
			<Separator marginHorizontal="$3" />
			<Input margin="$3" placeholder="Add a comment..." />
		</YStack>
	);
});

// PopoverDemo component

function PopoverDemo({
	Icon,
	Name,
	shouldAdapt = true,
	onAction,
	...props
}: PopoverDemoProps) {
	const handleClick = () => {
		if (Name) {
			onAction(Name, `${Name} content is displayed`);
		}
	};

	return (
		<Popover size="$5" allowFlip {...props}>
			<Popover.Trigger asChild>
				<Button iconAfter={Icon} onPress={handleClick} />
			</Popover.Trigger>

			{shouldAdapt && (
				<Adapt platform="touch">
					<Popover.Sheet modal dismissOnSnapToBottom>
						<Popover.Sheet.Frame padding="$4">
							<Adapt.Contents />
						</Popover.Sheet.Frame>
						<Popover.Sheet.Overlay
							animation="bouncy"
							enterStyle={{ opacity: 0 }}
							exitStyle={{ opacity: 0 }}
						/>
					</Popover.Sheet>
				</Adapt>
			)}

			<Popover.Content
				borderWidth={1}
				borderColor="$borderColor"
				enterStyle={{ y: -10, opacity: 0 }}
				exitStyle={{ y: -10, opacity: 0 }}
				elevate
				animation={['quick', { opacity: { overshootClamping: true } }]}>
				<Popover.Arrow borderWidth={1} borderColor="$borderColor" />
				<YStack gap="$3">
					<SizableText>{Name} content goes here.</SizableText>
					<Popover.Close asChild>
						<Button size="$3">Close</Button>
					</Popover.Close>
				</YStack>
			</Popover.Content>
		</Popover>
	);
}
