import '../../tamagui-web.css'

import { Stack } from 'expo-router'
import { TamaguiProvider } from 'tamagui'

import {tamaguiConfig} from '../../tamagui.config'

export const RootLayout = () => {


  return (
    <TamaguiProvider config={tamaguiConfig}>
        <Stack>
          <Stack.Screen name="menu" options={{ presentation: 'modal' }} />
          <Stack.Screen name="consulting" />
        </Stack>
    </TamaguiProvider>
  )
}

export default RootLayout