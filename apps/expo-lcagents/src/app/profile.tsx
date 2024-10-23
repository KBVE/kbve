import React from 'react';
import { ScrollView, View, Image, StyleSheet } from 'react-native';
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
    <ScrollView contentContainerStyle={styles.scrollViewContent}>
      <View style={styles.container}>
        <YStack f={1} jc="center" ai="center">
          <MemoizedLottieAnimation lottieJSON={lottieProfileAnimation} style={styles.lottieStyle} />
          <SizableText size="$3" theme="alt2">
            LC Agents Profile - Powered by KBVE
          </SizableText>
        </YStack>
        <Separator style={styles.separator} />
        <YStack>
          <TamaProfile
            supabaseUrl="https://supabase.kbve.com"
            supabaseAnonKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg"
					
          />
        </YStack>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 3,
  },
  container: {
    padding: 10,
  },
  lottieStyle: {
    width: 350,
    height: 350,
  },
  separator: {
    alignSelf: 'stretch',
    borderColor: 'cyan',
    paddingVertical: 10,
  },
});

export default Profile;
