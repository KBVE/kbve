import React, { memo } from 'react';
import {
    YStack,
    XStack,
    SizableText,
    Avatar,
    Button,
    Separator,
} from 'tamagui';
import { MessageCircle, Heart, MoreVertical } from '@tamagui/lucide-icons';
import { type IUserCardsPublic } from '../../type';



interface TamaProfileCardProps {
    data: IUserCardsPublic;
    loading: boolean;
    onAction: (actionState: string, content: string) => void;
}

export const TamaProfileCard = memo(function TamaProfileCard({
    data,
    loading,
    onAction,
}: TamaProfileCardProps) {
    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <YStack
            width={400}
            backgroundColor="$background"
            borderRadius="$4"
            padding="$4"
            shadowColor="$shadowColor"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.1}
            shadowRadius={20}>

            <XStack justifyContent="space-between" alignItems="center">
                <XStack alignItems="center" gap="$2">
                    {/* <Avatar circular size="$5">
                        <Avatar.Image source={{ uri: data.avatarUrl }} width="100%" height="100%" />
                    </Avatar> */}
                    <YStack>
                        <SizableText fontWeight="600" fontSize="$2">{data.username}</SizableText>
                        <SizableText fontSize="$1" color="$gray10">{data.bio}</SizableText>
                    </YStack>
                </XStack>
                <Button iconAfter={MoreVertical} onPress={() => onAction("Options", "Options menu opened")} />
            </XStack>

            <YStack paddingVertical="$3">
                <SizableText fontSize="$2" color="$gray11">{data.bio}</SizableText>
            </YStack>

            <Separator marginVertical="$3" />

            <XStack justifyContent="space-between" alignItems="center">
                <Button iconAfter={MessageCircle} onPress={() => onAction("Send Message", "Message sent")} />
                <Button iconAfter={Heart} onPress={() => onAction("Follow", "User followed")} />
            </XStack>
        </YStack>
    );
});
