import React, {
	useRef,
	useState,
	useEffect,
	useMemo,
	useCallback,
  } from 'react';
  import { YStack, SizableText, ScrollView, View, Button, useMedia } from 'tamagui';
  import { TamaRegister, LottieAnimation, TamaSheet, useBBQ} from '@kbve/expo-bbq';
  import { useNavigation } from 'expo-router';
  
  const Register = () => {
	const navigation = useNavigation();
	const router = useBBQ();
	const media = useMedia();
	const sheetRef = useRef<{
	  showSheet: () => void;
	  hideSheet: () => void;
	} | null>(null);
	const [sheetMessage, setSheetMessage] = useState('');
	const [isRegistered, setIsRegistered] = useState(false);
	const [hasError, setHasError] = useState(false);
  
	const lottieRegisterAnimation = useMemo(
	  () => require('../../assets/json/support.json'),
	  [],
	);
  
	const updateNavigationOptions = useCallback(() => {
	  navigation.setOptions({
		title: 'Register',
		headerBackTitle: 'Back',
	  });
	}, [navigation]);
  
	useEffect(() => {
	  updateNavigationOptions();
	}, [updateNavigationOptions]);
  
	const handleSuccess = () => {
	  setIsRegistered(true);
	  setHasError(false);
	  if (sheetRef.current) {
		setSheetMessage('Registration successful! Redirecting...');
		sheetRef.current.showSheet();
	  }
	};
  
	const handleError = (error: string) => {
	  setIsRegistered(false);
	  setHasError(true);
	  if (sheetRef.current) {
		setSheetMessage(`Registration failed: ${error}`);
		sheetRef.current.showSheet();
	  }
	};
  
	const renderSheetContent = () => {
	  return (
		<YStack ai="center" jc="center" paddingVertical={10}>
		  <SizableText>{sheetMessage}</SizableText>
		  {isRegistered && !hasError && (
			<YStack f={1} jc="center" ai="center" padding="$1" gap>
			  <Button
				onPress={() => {
				  if (sheetRef.current) {
					sheetRef.current.hideSheet();
				  }
				  router.go('/profile');
				}}
				color="green"
				size="$4"
				marginTop={10}
			  >
				Go to Profile
			  </Button>
			</YStack>
		  )}
		</YStack>
	  );
	};
  
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
			<LottieAnimation
			  lottieJSON={lottieRegisterAnimation}
			  style={{ width: 150, height: 150 }}
			/>
			<SizableText size="$3" theme="alt2">
			  Register using KBVE Auth
			</SizableText>
		  </YStack>
		  <YStack>
			<TamaRegister
			  siteKey="5ba581fa-b6fc-4bb0-8222-02fcd6a59e35"
			  supabaseUrl="https://supabase.kbve.com"
			  supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
			  onSuccess={handleSuccess}
			  onError={handleError}
			/>
		  </YStack>
		</View>
  
		<TamaSheet ref={sheetRef} title="Registration Status">
		  {renderSheetContent()}
		</TamaSheet>
	  </ScrollView>
	);
  };
  
  export default Register;
  