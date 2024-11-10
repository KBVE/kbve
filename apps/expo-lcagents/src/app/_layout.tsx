import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Link, SplashScreen, Stack, usePathname } from 'expo-router'
import { Pressable, useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'
import { PortalProvider } from 'tamagui';



import { Platform } from "react-native";

import config  from '../../tamagui.config'
import { useFonts } from 'expo-font'
import { useEffect } from 'react'
import { MenuSquare } from '@tamagui/lucide-icons'

import { NavBar } from './_nav'
export {
  ErrorBoundary,
} from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

if (Platform.OS === 'web') {
  require('../../tamagui-web.css');
}

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [interLoaded, interError] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  useEffect(() => {
    if (interLoaded || interError) {
      SplashScreen.hideAsync()
    }
  }, [interLoaded, interError])

  if (!interLoaded && !interError) {
    return null
  }

  return <RootLayoutNav />
}

function RootLayoutNav() {
  const colorScheme = 'dark';  // Hardcode the theme to 'dark'

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme as any}>
      <PortalProvider shouldAddRootHost>
      <ThemeProvider value={DarkTheme}>
      
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="menu" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="consulting"  options={{  animation: 'fade' }} />
          <Stack.Screen name="register"  options={{  animation: 'fade' }} />
          <Stack.Screen name="login"  options={{  animation: 'fade' }} />
          <Stack.Screen name="profile" options={{  animation: 'fade' }} />
          

        </Stack>
       
      </ThemeProvider>
      </PortalProvider>
    </TamaguiProvider>
  );
}