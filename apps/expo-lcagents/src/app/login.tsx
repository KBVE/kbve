import React, {
	useRef,
	useState,
	useEffect,
	useMemo,
	useCallback,
} from 'react';
import { YStack, SizableText, ScrollView, View } from 'tamagui';
import { TamaLogin, LottieAnimation, TamaSheet, useBBQ, TamaSkeleton } from '@kbve/expo-bbq';
import { useNavigation } from 'expo-router';

const Login = () => {
	const navigation = useNavigation();
	const router = useBBQ();
	const sheetRef = useRef<{
		showSheet: () => void;
		hideSheet: () => void;
	} | null>(null);
	const [sheetMessage, setSheetMessage] = useState('');

	const lottieLoginAnimation = useMemo(
		() => require('../../assets/json/vr.json'),
		[],
	);

	// Memoizing navigation update function
	const updateNavigationOptions = useCallback(() => {
		navigation.setOptions({
			title: 'Profile',
			headerBackTitle: 'Back',
		});
	}, [navigation]);

	useEffect(() => {
		updateNavigationOptions();
	}, [updateNavigationOptions]);

	const handleSuccess = () => {
		if (sheetRef.current) {
			setSheetMessage('Login successful! Redirecting...');
			sheetRef.current.showSheet();
		}

		setTimeout(() => {
			sheetRef.current?.hideSheet();
			router.go('/profile');
		  }, 3000);
	};

	const MemoizedLottieAnimation = React.memo(LottieAnimation);

	const handleError = (error: string) => {
		if (sheetRef.current) {
			setSheetMessage(error);
			sheetRef.current.showSheet();
		}
	};

	return (
		<ScrollView
			contentContainerStyle={{
				flexGrow: 1,
				justifyContent: 'center',
				paddingVertical: 10,
			}}>
			<TamaSkeleton />
			<View style={{ padding: 10 }}>
				<YStack f={1} jc="center" ai="center">
					{/* Lottie Animation */}
					<SizableText size="$3" theme="alt2">
						Login to Your Account
					</SizableText>
				</YStack>
				<YStack>
					{/* Login Form */}
					<TamaLogin
						siteKey="5ba581fa-b6fc-4bb0-8222-02fcd6a59e35"
						supabaseUrl="https://supabase.kbve.com"
						supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
						onSuccess={handleSuccess}
						onError={handleError}
					/>
				</YStack>
			</View>

			<MemoizedLottieAnimation
				lottieJSON={lottieLoginAnimation}
				style={{
					width: 150,
					height: 'auto',
					aspectRatio: 1,
					maxWidth: 800,
				}}
			/>

			<TamaSheet ref={sheetRef} title="Login Status">
				<SizableText>{sheetMessage}</SizableText>
			</TamaSheet>
		</ScrollView>
	);
};

export default Login;
