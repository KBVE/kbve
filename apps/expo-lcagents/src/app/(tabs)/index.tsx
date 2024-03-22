import { Text, View, Button, Card, H2, Image, Paragraph, XStack, YStack, H1, Separator } from 'tamagui'


interface CardProps {
  title: string;
  paragraph: string;
  buttonText: string;
  animation?: string;
  size?: string;
  width?: number | string;
  height?: number | string;
  scale?: number;
  hoverStyle?: object;
  pressStyle?: object;
}

function HomeCards() {
  return (
    <XStack $sm={{ flexDirection: 'column' }} paddingHorizontal="$4" space>
      <DemoCard
        title="Projects"
        paragraph="Check out our cool projects"
        buttonText='Read More!'
        animation="bouncy"
        size="$4"
        width={250}
        height={300}
        scale={0.9}
        hoverStyle={{ scale: 0.925 }}
        pressStyle={{ scale: 0.875 }}
      />
      
    </XStack>
  )
}

export function DemoCard({ title, paragraph, buttonText, ...props }: CardProps) {
  return (
    <Card elevate size="$4" bordered {...props}>
      <Card.Header padded>
        <H2 color="white">{title}</H2>
        <Paragraph theme="alt2" color="white">{paragraph}</Paragraph>
      </Card.Header>
      <Card.Footer padded>
        <XStack flex={1} />
        <Button borderRadius="$10">{buttonText}</Button>
      </Card.Footer>
      <Card.Background>
        <Image
          resizeMode="contain"
          alignSelf="center"
          source={{
            width: 300,
            height: 300,
            uri: 'https://images.unsplash.com/photo-1541976844346-f18aeac57b06?q=80&w=300&auto=format&fit=crop' 
            }}  />
      </Card.Background>
    </Card>
  )
}


interface HeroProps {
  backgroundImageUri: string;
  title: string;
  description: string;
  buttonOneText: string;
  buttonTwoText: string;
  onButtonOnePress?: () => void;
  onButtonTwoPress?: () => void;
}


export function Hero({
  backgroundImageUri,
  title,
  description,
  buttonOneText,
  buttonTwoText,
  onButtonOnePress,
  onButtonTwoPress,
}: HeroProps) {
  return (
    <Card
      elevate
      style={{
        width: '100%',
        height: 500,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Image
        source={{ uri: backgroundImageUri }}
        style={{ width: '100%', height: '100%', position: 'absolute' }}
        resizeMode="cover"
      />
      <YStack
        space
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: 'rgba(0, 0, 0, 0.4)', // Add a dark overlay to ensure text is readable
        }}
      >
        <H1 color="white" style={{ textAlign: 'center' }}>{title}</H1>
        <p style={{ color: 'white', textAlign: 'center', margin: '10px 0' }}>{description}</p>
        <XStack space="$2" alignItems="center">
          <Button onPress={onButtonOnePress}>{buttonOneText}</Button>
          <Button onPress={onButtonTwoPress}>{buttonTwoText}</Button>
        </XStack>
      </YStack>
    </Card>
  );
}

export default function TabOneScreen() {
  return (
    <View flex={1} alignItems="center">
      <Hero 
        backgroundImageUri='https://images.unsplash.com/photo-1711029028695-6db032f5c476?q=80&w=2056&auto=format&fit=crop'
        title='L & C Agents'
        description='L & C Agency'
        buttonOneText='Contact'
        buttonTwoText='Support'
      />
      <Separator marginVertical={15} />
      <HomeCards />
    </View>
  )
}