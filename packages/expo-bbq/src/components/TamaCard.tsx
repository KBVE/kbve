import {
	Button,
	Card,
	H2,
	Image,
	Paragraph,
	XStack,
	YStack,
	Separator,
	Circle,
} from 'tamagui';


import { Link } from 'expo-router';

interface TamaCardProps {
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
	linker: string;
	image?: string;
}

export function TamaCard({
	title,
	paragraph,
	buttonText,
	linker,
	...props
}: TamaCardProps) {
	return (
		<Link href={linker} asChild>
			<Card elevate size="$4" bordered {...props} backgroundColor="gray">
				<Card.Header padded>
					
						<YStack
							backgroundColor="rgba(0, 0, 0, 0.5)"
							borderRadius="$2"
							padding="$2">
							<H2 color="white">{title}</H2>
							<Separator marginVertical={5} />
							<Paragraph theme="alt2" color="white">
								{paragraph}
							</Paragraph>
						</YStack>
					
				</Card.Header>
				<Card.Footer padded>
					<XStack flex={1} />

					<Button borderRadius="$10">{buttonText}</Button>
				</Card.Footer>
				<Card.Background>
					<Image
						resizeMode="cover"
						alignSelf="center"
						source={{
							width: 300,
							height: 300,
							uri: props.image,
						}}
					/>
				</Card.Background>
			</Card>
		</Link>
	);
}
