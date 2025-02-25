import {
	DarkTheme,
	DefaultTheme,
	NavigationContainer,
	ThemeProvider,
} from '@react-navigation/native';
import { Link, SplashScreen, Stack, usePathname } from 'expo-router';
import {
	initialWindowMetrics,
	SafeAreaProvider,
	SafeAreaView,
} from 'react-native-safe-area-context';
import { StatusBar, useColorScheme } from 'react-native';
import { PortalProvider, TamaguiProvider, useTheme, View } from 'tamagui';
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
					<SafeAreaView>

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
					</SafeAreaView>
				</ThemeProvider>
			</PortalProvider>
		</TamaguiProvider>
	);
}

const InnerApp = () => {
	const colorScheme = useColorScheme() || 'light';
	const isDarkMode = colorScheme === 'dark';
	const theme = useTheme();

	return (
		<SafeAreaProvider initialMetrics={initialWindowMetrics}>
			<StatusBar
				backgroundColor={theme.borderColor?.val}
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>
			<NavigationContainer
				theme={isDarkMode ? DarkTheme : DefaultTheme}
				children={undefined}></NavigationContainer>
		</SafeAreaProvider>
	);
};

export default RootLayout;
