import React, { ReactNode, useState } from 'react'
import { YStack, XStack, Text, Image, Input, Button, Avatar, Separator, PopoverProps } from 'tamagui'
import { Heart, MessageCircle, Bookmark, Share2, MoreVertical } from '@tamagui/lucide-icons'
import { Popover, Adapt } from 'tamagui'

interface PopoverDemoProps extends PopoverProps {
    Icon?: any
    Name?: string
    shouldAdapt?: boolean
  }

export function InstaCard() {
  const [shouldAdapt, setShouldAdapt] = useState(true)

  return (
    <YStack
      width={400}
      backgroundColor="$background"
      borderRadius="$4"
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 4 }}
      shadowOpacity={0.1}
      shadowRadius={20}
    >
      {/* Header */}
      <XStack justifyContent="space-between" padding="$3">
        <XStack alignItems="center" space="$2">
          <Avatar circular size="$3">
            <Avatar.Image
              source={{ uri: "https://source.unsplash.com/50x50/?portrait" }}
              width="100%"
              height="100%"
            />
          </Avatar>
          <YStack>
            <Text fontWeight="600" fontSize="$2">leroy_jenkins72</Text>
            <Text fontSize="$1" color="$gray10">Somewhere</Text>
          </YStack>
        </XStack>

        {/* Popover Button */}
        <PopoverDemo placement="bottom" Icon={MoreVertical} Name="options-popover" />
      </XStack>

      {/* Image */}
      <Image
        source={{ uri: "https://source.unsplash.com/301x301/?random" }}
        width="100%"
        height={300}
        borderRadius="$2"
      />

      {/* Action Buttons */}
      <XStack padding="$3" justifyContent="space-between" alignItems="center">
        <XStack space="$3">
          <PopoverDemo placement="bottom" Icon={Heart} Name="like-popover" />
          <PopoverDemo placement="bottom" Icon={MessageCircle} Name="comment-popover" />
          <PopoverDemo placement="bottom" Icon={Share2} Name="share-popover" />
        </XStack>
        <PopoverDemo placement="bottom" Icon={Bookmark} Name="bookmark-popover" />
      </XStack>

      {/* Likes Section */}
      <XStack paddingHorizontal="$3" space="$2" alignItems="center">
        <Avatar circular size="$2">
          <Avatar.Image
            source={{ uri: "https://source.unsplash.com/40x40/?portrait?1" }}
            width="100%"
            height="100%"
          />
        </Avatar>
        <Avatar circular size="$2">
          <Avatar.Image
            source={{ uri: "https://source.unsplash.com/40x40/?portrait?2" }}
            width="100%"
            height="100%"
          />
        </Avatar>
        <Avatar circular size="$2">
          <Avatar.Image
            source={{ uri: "https://source.unsplash.com/40x40/?portrait?3" }}
            width="100%"
            height="100%"
          />
        </Avatar>
        <Text fontSize="$2">
          Liked by <Text fontWeight="600">Mamba UI</Text> and <Text fontWeight="600">86 others</Text>
        </Text>
      </XStack>

      {/* Caption */}
      <YStack paddingHorizontal="$3" paddingVertical="$2">
        <Text fontSize="$2">
          <Text fontWeight="600">leroy_jenkins72 </Text>
          Nemo ea quasi debitis impedit!
        </Text>
      </YStack>

      {/* Comment Input */}
      <Separator marginHorizontal="$3" />
      <Input margin="$3" placeholder="Add a comment..." />
    </YStack>
  )
}

// PopoverDemo component

function PopoverDemo({ Icon, Name, shouldAdapt = true, ...props }: PopoverDemoProps) {
    return (
    <Popover size="$5" allowFlip {...props}>
      <Popover.Trigger asChild>
        <Button iconAfter={Icon} />
      </Popover.Trigger>

      {shouldAdapt && (
        <Adapt platform="touch">
          <Popover.Sheet modal dismissOnSnapToBottom>
            <Popover.Sheet.Frame padding="$4">
              <Adapt.Contents />
            </Popover.Sheet.Frame>
            <Popover.Sheet.Overlay
              animation="lazy"
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
        animation={['quick', { opacity: { overshootClamping: true } }]}
      >
        <Popover.Arrow borderWidth={1} borderColor="$borderColor" />
        <YStack gap="$3">
          <Text>{Name} content goes here.</Text>
          <Popover.Close asChild>
            <Button size="$3">Close</Button>
          </Popover.Close>
        </YStack>
      </Popover.Content>
    </Popover>
  )
}
