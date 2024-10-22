import React from 'react';
import { ScrollView, View, Image } from 'react-native';
import { YStack, SizableText } from 'tamagui';
import { TamaRegister, LottieAnimation } from '@kbve/expo-bbq';

import { useNavigation } from 'expo-router';

const Register = () => {

  const navigation = useNavigation();

	React.useEffect(() => {
		navigation.setOptions({
			title: 'Register',
      headerBackTitle: 'Back'
		});
	}, [navigation]);

	return (
		<ScrollView
			contentContainerStyle={{
				flexGrow: 1,
				justifyContent: 'center',
				paddingVertical: 10,
			}}
			>
			<View style={{ padding: 10 }}>
				<YStack f={1} jc="center" ai="center">
					{/* Lottie Animation */}
					<LottieAnimation
						lottieJSON={require('../../assets/json/support.json')}
						style={{ width: 150, height: 150 }}
					/>
					<SizableText size="$3" theme="alt2">
						Register using KBVE Auth
					</SizableText>
				</YStack>
				<YStack>
					{/* Register Form */}
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
