import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Link, SplashScreen, Stack } from 'expo-router'
import { Pressable, useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'

import '../../tamagui-web.css'

import { Platform } from "react-native";

import { config } from '../../tamagui.config'
import { useFonts } from 'expo-font'
import { useEffect } from 'react'
import { MenuSquare } from '@tamagui/lucide-icons'

import { NavBar } from './_nav'

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router'

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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

  if (!interLoaded && !interError) {
    return null
  }

  return <RootLayoutNav />
}

function RootLayoutNav() {
  const colorScheme = useColorScheme()

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme as any}>
      <ThemeProvider value={colorScheme === 'light' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
          <Stack.Screen name="consulting" />
          {/* <Stack.Screen name="projects"
           options={{
            headerShown: true, // Ensure the header is shown
            title: 'Projects', // Set the title for the header
            // Add more options as needed
            headerLeft: () => (
              <NavBar />
            ),
          }}  /> */}
        </Stack>
      </ThemeProvider>
    </TamaguiProvider>
  )
}