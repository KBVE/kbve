'use client'

import '../../tamagui-web.css'

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'
import { TamaguiProvider } from 'tamagui'

import { tamaguiConfig } from '../../tamagui.config'

export default function RootLayout() {

  const colorScheme = useColorScheme()

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme!}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
          <Stack.Screen name="consulting" />
        </Stack>
      </ThemeProvider>
    </TamaguiProvider>
  )
}