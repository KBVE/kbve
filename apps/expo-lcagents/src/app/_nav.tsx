import { MenuSquare, Home } from '@tamagui/lucide-icons';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { XStack } from 'tamagui';

const NavBarSection = () => {
	return (
		<XStack>
			<Link href="/menu" asChild>
				<Pressable>
					<MenuSquare color="cyan" padding="$4" />
				</Pressable>
			</Link>

			<Link href="/" asChild>
				<Pressable>
					<Home color="cyan" padding="$4" />
				</Pressable>
			</Link>
		</XStack>
	);
};

export const NavBar = () => {
	return <NavBarSection />;
};
