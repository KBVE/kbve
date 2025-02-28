import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider
} from '@react-navigation/native';
import { SplashScreen, Stack } from 'expo-router';

import { useColorScheme } from 'react-native';
import { PortalProvider, TamaguiProvider } from 'tamagui';
// import {GestureHandlerRootView} from 'react-native-gesture-handler';

import { Platform } from 'react-native';

import tamaguiConfig from '../../tamagui.config';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';

// export { ErrorBoundary } from 'expo-router';

// export const unstable_settings = {
// 	initialRouteName: 'menu',
// };

if (Platform.OS === 'web') {
	require('../../tamagui-web.css');
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
							name="(tabs)"
							options={{
								headerShown: false,
								animation: 'slide_from_bottom',
							}}
						/>

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
