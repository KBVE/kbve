import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { YStack, XStack, SizableText, Separator, ScrollView, Button } from 'tamagui';
import { TamaOnboard, LottieAnimation, TamaSheet, useBBQ  } from '@kbve/expo-bbq';
import { useNavigation } from 'expo-router';

const Onboard = () => {

    //  [C ~~> Nav[]]
    const navigation = useNavigation();
    const router = useBBQ();
    //  [Sheet]
    const sheetRef = useRef<{
        showSheet: () => void;
        hideSheet: () => void;
    } | null>(null);

    //  [States]
    const [sheetMessage, setSheetMessage] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const [hasError, setHasError] = useState(false);

    //  [Lottie] => (Memo) -> JSON animation for the onboarding screen, since its a static asset.
    const lottieOnboardAnimation = useMemo(
        () => require('../../assets/json/360-vr.json'),
        [],
    );

    //  [Navigation] => (useCallback) <~> (useEffect)
    const updateNavigationOptions = useCallback(() => {
        navigation.setOptions({
            title: 'Onboarding',
            headerBackTitle: 'Back',
        });

    }, [navigation]);

    useEffect(
        () => {
            updateNavigationOptions();
        }, [updateNavigationOptions]
    );

    //  [onSuccess] ?=>
    const handleSuccess = () => {
        setIsComplete(true);
        setHasError(false);
        //  [i18n]  ??  NULL => TamaI18N('[onboard_true']); ($->trigger)
        setSheetMessage('Onboarding completed successfully!');
        if(sheetRef.current) {
            sheetRef.current.showSheet();
        }
    };

    //  [onError] ?=>
    const handleError = (error: string) => {
        setIsComplete(false);
        setHasError(true);
        //  [i18n]  ??  NULL => TamaI18N('[onboard_error']); ($->trigger)[error:key]
        if(sheetRef.current) {
            sheetRef.current.showSheet();
        }
    };


    const renderSheetContent = () => {
		return (
			<YStack ai="center" jc="center" paddingVertical={10}>
				<SizableText>{sheetMessage}</SizableText>
				{isComplete && !hasError && (
					<Button
						onPress={() => {
							if (sheetRef.current) {
								sheetRef.current.hideSheet();
							}
							router.go('/profile'); // Navigate to the profile page after successful onboarding
						}}
						color="green"
						size="$4"
						marginTop={10}
					>
						Go to Profile
					</Button>
				)}
			</YStack>
		);
	};

    const MemoizedLottieAnimation = React.memo(LottieAnimation);

    return (
		<ScrollView contentContainerStyle={{ flexGrow: 1 }}>
			<YStack f={1} jc="center" ai="center" padding="$4">
				<SizableText size="$4" theme="alt2">Welcome to Onboarding</SizableText>
				<MemoizedLottieAnimation
					lottieJSON={lottieOnboardAnimation}
					style={{
						width: 150,
						height: 'auto',
						aspectRatio: 1,
						maxWidth: 800,
					}}
				/>
				<TamaOnboard
					supabaseUrl="https://supabase.kbve.com"
                    supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
                    onSuccess={handleSuccess}
					onError={handleError}
				/>
			</YStack>

			<TamaSheet ref={sheetRef} title="Onboarding Status">
				{renderSheetContent()}
			</TamaSheet>
		</ScrollView>
	);

};

export default Onboard;