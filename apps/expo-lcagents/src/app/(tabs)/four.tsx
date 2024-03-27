import { Text, View } from 'tamagui'

import { BBQEmbed } from '@kbve/expo-bbq';

export default function TabFourScreen() {
  return (
    <View flex={1} alignItems="center">
      {/* <Text fontSize={20} color="aliceblue">Fish & Chip</Text> */}
      <BBQEmbed src="https://kbve.com/arcade/fishchip/itch/" />
    </View>
  )
}