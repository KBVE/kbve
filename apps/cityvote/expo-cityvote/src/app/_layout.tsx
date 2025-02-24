import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Link, SplashScreen, Stack } from 'expo-router'
import { Pressable, useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'

import { Platform } from "react-native";

import { config } from '../../tamagui.config'
import { useFonts } from 'expo-font'
import { useEffect } from 'react'
import { MenuSquare } from '@tamagui/lucide-icons'

import { NavBar } from './_nav'

// export {
//   ErrorBoundary,
// } from 'expo-router'


// Prevent the splash screen from auto-hiding before asset loading is complete.
// SplashScreen.preventAutoHideAsync()

export default function RootLayout() {

  const colorScheme = useColorScheme()
  const [interLoaded, interError] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  useEffect(() => {
    if (interLoaded || interError) {
      // Hide the splash screen after the fonts have loaded (or an error was returned) and the UI is ready.
      SplashScreen.hideAsync()
    }
  }, [interLoaded, interError])


  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme as any}>
      <ThemeProvider value={colorScheme === 'light' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
          <Stack.Screen name="consulting" />
        </Stack>
      </ThemeProvider>
    </TamaguiProvider>
  )
}