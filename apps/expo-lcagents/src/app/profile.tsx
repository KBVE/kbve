import React from 'react';
import { ScrollView, View } from 'react-native';
import { YStack, SizableText, Separator } from 'tamagui';
import { TamaProfile, LottieAnimation } from '@kbve/expo-bbq';
import { useNavigation } from 'expo-router';

const Profile = () => {
  const navigation = useNavigation();

  // Memoizing Lottie animation JSON
  const lottieProfileAnimation = React.useMemo(() => require('../../assets/json/profile.json'), []);

  // Memoizing navigation update function
  const updateNavigationOptions = React.useCallback(() => {
    navigation.setOptions({
      title: 'Profile',
      headerBackTitle: 'Back',
    });
  }, [navigation]);

  React.useEffect(() => {
    updateNavigationOptions();
  }, [updateNavigationOptions]);

  const MemoizedLottieAnimation = React.memo(LottieAnimation);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', padding: 10 }}>
        <YStack
          f={1}
          jc="center"
          ai="center"
          $sm={{
            paddingHorizontal: 10,
            maxWidth: '100%',
          }}
          $md={{
            paddingHorizontal: 20,
            maxWidth: '80%',
          }}
          $lg={{
            paddingHorizontal: 30,
            maxWidth: '60%',
          }}
        >
          <MemoizedLottieAnimation
            lottieJSON={lottieProfileAnimation}
            style={{
              width: '100%',
              height: undefined,
              aspectRatio: 1,
              maxWidth: 400, // Cap the width on larger screens
            }}
          />
          <SizableText size="$3" theme="alt2" $sm={{ size: '$5' }} $lg={{ size: '$6' }}>
            LC Agents Profile - Powered by KBVE
          </SizableText>
        </YStack>

        <Separator
          $sm={{
            alignSelf: 'stretch',
            borderColor: 'cyan',
            paddingVertical: 5,
          }}
          $md={{
            alignSelf: 'stretch',
            borderColor: 'cyan',
            paddingVertical: 10,
          }}
          $lg={{
            alignSelf: 'stretch',
            borderColor: 'cyan',
            paddingVertical: 15,
          }}
        />

        <YStack
          f={1}
          jc="center"
          ai="center"
          $sm={{ paddingHorizontal: 10 }}
          $md={{ paddingHorizontal: 20 }}
          $lg={{ paddingHorizontal: 30 }}
        >
          <TamaProfile
            supabaseUrl="https://supabase.kbve.com"
            supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
          />
        </YStack>
      </View>
    </ScrollView>
  );
};

export default Profile;
