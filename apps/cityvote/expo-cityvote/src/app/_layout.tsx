import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from '@react-navigation/native';
import { Link, SplashScreen, Stack, usePathname } from 'expo-router';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import { PortalProvider } from 'tamagui';

import { Platform } from 'react-native';

import tamaguiConfig from '../../tamagui.config';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
	initialRouteName: 'menu',
};

if (Platform.OS === 'web') {
	require('../../tamagui-web.css');
}

SplashScreen.preventAutoHideAsync();

export function RootLayout() {
	const colorScheme = useColorScheme();

	const [interLoaded, interError] = useFonts({
		Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
		InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
	});

	useEffect(() => {
		if (interLoaded || interError) {
			SplashScreen.hideAsync();
		}
	}, [interLoaded, interError]);

	if (!interLoaded && !interError) {
		return null;
	}

	return (
		<TamaguiProvider
			config={tamaguiConfig}
			defaultTheme={colorScheme || 'dark'}>
			<PortalProvider shouldAddRootHost>
				<ThemeProvider
					value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
					<Stack>
						<Stack.Screen
							name="menu"
							options={{
								presentation: 'modal',
								animation: 'fade',
							}}
						/>
						<Stack.Screen
							name="consulting"
							options={{ animation: 'fade' }}
						/>
					</Stack>
				</ThemeProvider>
			</PortalProvider>
		</TamaguiProvider>
	);
}

export default RootLayout;
