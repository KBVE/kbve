
import {
	Button,
	Card,
	H2,
	Image,
	Paragraph,
	XStack,
} from 'tamagui';

import { Link } from 'expo-router';


interface TamaCardProps  {
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
    linker?: string;
}



export function TamaCard({
	title,
	paragraph,
	buttonText,
    linker,
	...props
}: TamaCardProps ) {

        // Conditionally rendered Button or Button within a Link
    const RenderButton = () => {
        if (linker) {
        // If linker is provided, wrap Button in Link
        return (
            <Link href={linker}>
            <Button borderRadius="$10">{buttonText}</Button>
            </Link>
        );
        } else {
        // If no linker, render Button alone
        return <Button borderRadius="$10">{buttonText}</Button>;
        }
    };


	return (
		<Card elevate size="$4" bordered {...props} backgroundColor="gray">
			<Card.Header padded>
				<H2 color="white">{title}</H2>
				<Paragraph theme="alt2" color="white">
					{paragraph}
				</Paragraph>
			</Card.Header>
			<Card.Footer padded>
				<XStack flex={1} />
                <RenderButton />
			</Card.Footer>
			<Card.Background>
				<Image
					resizeMode="cover"
					alignSelf="center"
					source={{
						width: 300,
						height: 300,
						uri: 'https://images.unsplash.com/photo-1541976844346-f18aeac57b06?q=80&w=300&auto=format&fit=crop',
					}}
				/>
			</Card.Background>
		</Card>
	);
}