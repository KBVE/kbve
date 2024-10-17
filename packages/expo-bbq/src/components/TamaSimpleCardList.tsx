import React from 'react';
import { Button, Card, Image, XStack, YStack, H1, Paragraph } from 'tamagui';
import { Link } from 'expo-router';
import { ChevronRight } from '@tamagui/lucide-icons';

interface CardData {
  ulid: string;
  title: string;
  subTitle?: string;
  icon?: JSX.Element;
  text: string;
  img: string;
  route: string;
}

interface TamaSimpleCardListProps {
  data: CardData[];
}

export function TamaSimpleCardList({ data }: TamaSimpleCardListProps) {
  return (
    <YStack space="$4" padding="$4">
      {data.map((item) => (
        <Card
          key={item.ulid}
          elevate
          style={{
            width: '100%',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Link href={item.route} asChild>
            <YStack>
              {/* Background Image */}
              <Image
                source={{ uri: item.img }}
                style={{ width: '100%', height: 200 }}
                resizeMode="cover"
              />
              
              {/* Card Content */}
              <YStack
                space
                padding="$4"
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)', // Add overlay for text readability
                }}
              >
                {item.icon && <XStack alignItems="center">{item.icon}</XStack>}
                <H1 color="white" style={{ textAlign: 'center' }}>
                  {item.title}
                </H1>
                {item.subTitle && (
                  <Paragraph theme="alt2" color="white" style={{ textAlign: 'center' }}>
                    {item.subTitle}
                  </Paragraph>
                )}
                <Paragraph theme="alt2" color="white" style={{ textAlign: 'center' }}>
                  {item.text}
                </Paragraph>
                <XStack space="$2" alignItems="center">
                  <Button iconAfter={<ChevronRight />}>
                    Go to {item.title}
                  </Button>
                </XStack>
              </YStack>
            </YStack>
          </Link>
        </Card>
      ))}
    </YStack>
  );
}
