/* eslint-disable jsx-a11y/accessible-emoji */
import React, { useRef, useState } from 'react';
import {
	SafeAreaView,
	StyleSheet,
	ScrollView,
	View,
	Text,
	StatusBar,
	TouchableOpacity,
	Linking,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';



export const App = () => {

	const [whatsNextYCoord, setWhatsNextYCoord] = useState<number>(0);
	const scrollViewRef = useRef<null | ScrollView>(null);

	return (
		<>
			<StatusBar barStyle="dark-content" />
			<SafeAreaView className="flex-1">
				<ScrollView
					ref={(ref) => {
						scrollViewRef.current = ref;
					}}
					contentInsetAdjustmentBehavior="automatic"
					className="bg-cyan">
					<View className="my-6 mx-3">
						<Text className="text-2xl">Hello there,</Text>
						<Text
							className="text-5xl font-medium pt-3"
							testID="heading"
							role="heading">
							Welcome ExpoHqplan 👋
						</Text>
					</View>
					<View className="my-6 mx-3">
						<View className="rounded-xl bg-[#143055] p-9 mb-6">
							<View className="flex-1 flex-row">
								<Svg
									width={32}
									height={32}
									stroke="hsla(162, 47%, 50%, 1)"
									fill="none"
									viewBox="0 0 24 24">
									<Path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
									/>
								</Svg>
								<Text className="text-2xl text-white ml-3"
									>
									You're up and running
								</Text>
							</View>
							<TouchableOpacity
								className="bg-white py-4 rounded-lg w-1/2 mt-6"
								onPress={() => {
									scrollViewRef.current?.scrollTo({
										x: 0,
										y: whatsNextYCoord,
									});
								}}>
								<Text
									className="text-lg text-center">
									What's next?
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
};
export default App;
