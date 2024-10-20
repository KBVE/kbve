import React from 'react';
import { View, Text } from 'tamagui';
import { useColorScheme } from 'react-native';
import { TamaRegister } from '@kbve/expo-bbq';

const Register = () => {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? 'cyan' : 'black'; 

  return (
    <View>
        <Text col={textColor}>
            Register to LC-Agents using KBVE Auth
        </Text>
      <TamaRegister siteKey="5ba581fa-b6fc-4bb0-8222-02fcd6a59e35" supabaseUrl='https://supabase.kbve.com' supabaseAnonKey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg'/>
    </View>
  );
};

export default Register;