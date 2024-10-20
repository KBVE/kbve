import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { YStack } from 'tamagui';
import { useColorScheme } from 'react-native';
import { TamaRegister, LottieAnimation } from '@kbve/expo-bbq';

const Register = () => {
	const colorScheme = useColorScheme();
	const isDarkMode = colorScheme === 'dark';
	const textColor = isDarkMode ? 'cyan' : 'black';
	const backgroundColor = isDarkMode ? '#1a1a1a' : '#f5f5f5';

	return (
		<ScrollView
			contentContainerStyle={{
				flexGrow: 1,
				justifyContent: 'center',
				paddingVertical: 10,
			}}
			style={{ backgroundColor }}>
			<View style={{ padding: 10 }}>
				<YStack f={1} jc="center" ai="center">
					{/* Lottie Animation */}
					<LottieAnimation
						lottieJSON={require('../../assets/json/support.json')}
						style={{ width: 150, height: 150 }}
					/>

					{/* Title and Description */}
					<Text
						style={{
							color: textColor,
							fontSize: 12,
							textAlign: 'center',
							marginBottom: 10,
						}}>
						Register using KBVE Auth to get started
					</Text>

					{/* Register Form */}
				</YStack>
				<YStack>
					<TamaRegister
						siteKey="5ba581fa-b6fc-4bb0-8222-02fcd6a59e35"
						supabaseUrl="https://supabase.kbve.com"
						supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
					/>
				</YStack>
			</View>
		</ScrollView>
	);
};

export default Register;
