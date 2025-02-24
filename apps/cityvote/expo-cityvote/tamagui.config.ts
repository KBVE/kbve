import { defaultConfig } from '@tamagui/config/v4'
import { createTamagui } from 'tamagui'

export const tamaguiConfig = createTamagui(defaultConfig)

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends Conf {}
}