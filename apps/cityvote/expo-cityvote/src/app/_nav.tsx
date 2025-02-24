'use client'

import { MenuSquare, Home } from '@tamagui/lucide-icons';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { XStack } from 'tamagui';

export const NavBar = () => {
	return (
		<XStack>
			<Link href="/menu" asChild>
				<Pressable>
					<MenuSquare color="cyan" p="$4" />
				</Pressable>
			</Link>

			<Link href="/" asChild>
				<Pressable>
					<Home color="cyan" p="$4" />
				</Pressable>
			</Link>
		</XStack>
	);
};



export default NavBar;
