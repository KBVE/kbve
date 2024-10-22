import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text, YStack, Sheet } from 'tamagui';
import { CheckCircle, XCircle } from '@tamagui/lucide-icons'; 
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { useRouter } from 'expo-router'; // Assuming you are using Expo Router
import { createSupabaseClient } from '../wrapper/Supabase';

type HCaptchaType = typeof HCaptchaWeb | typeof ConfirmHcaptcha;

export function TamaLogin({ siteKey, supabaseUrl, supabaseAnonKey }: { siteKey: string, supabaseUrl: string, supabaseAnonKey: string }) {
  const [status, setStatus] = useState<'off' | 'loggingIn' | 'loggedIn'>('off');
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });
  const [showSheet, setShowSheet] = useState(false); 
  const [sheetMessage, setSheetMessage] = useState('');
  const captchaForm = useRef<ConfirmHcaptcha | null>(null);
  const HCaptchaComponent: HCaptchaType = Platform.OS === 'web' ? HCaptchaWeb : ConfirmHcaptcha;
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
  const router = useRouter();

  useEffect(() => {
    if (status === 'loggingIn') {
      const timer = setTimeout(() => setStatus('off'), 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [status]);

  const handleSubmit = async () => {
    if (!captchaToken) {
      alert('Please complete the captcha');
      return;
    }

    setStatus('loggingIn');
    const { email, password } = formValues;

    try {
      // Call Supabase's signIn method
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          captchaToken, // Pass the hCaptcha token
        },
      });

      if (error) {
        console.error('Supabase login error:', error.message);
        setCaptchaStatus('waiting');  // Reset the captcha
        setSheetMessage(`Login failed: ${error.message}`);
        setShowSheet(true);  // Show error sheet
      } else {
        console.log('User logged in:', data);
        setStatus('loggedIn');
        setSheetMessage('Login successful!');
        setShowSheet(true);

        // Redirect to profile after login
        router.replace('/profile'); // Adjust the route path as needed
      }
    } catch (error) {
      console.error('Error during login:', error);
      setCaptchaStatus('waiting');
      setSheetMessage('An error occurred during login.');
      setShowSheet(true);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const onMessage = (event: any) => {
    const eventData = event?.nativeEvent?.data;

    if (eventData) {
      console.log('Event Data from hCaptcha:', eventData);

      if (eventData === 'open') return;

      if (['cancel', 'error', 'expired'].includes(eventData)) {
        captchaForm.current?.hide();
        setCaptchaStatus('error');
        console.log(`hCaptcha status: ${eventData}`);
      } else {
        console.log('Verified code from hCaptcha:', eventData);
        setCaptchaToken(eventData);
        setCaptchaStatus('success');
        captchaForm.current?.hide();
      }
    }
  };

  const handleRetryCaptcha = () => {
    setCaptchaStatus('waiting');
    captchaForm.current?.show();
  };

  return (
    <YStack
      justifyContent="center"
      alignItems="center"
      padding="$4"
    >
      <Form
        alignItems="center"
        gap="$4"
        onSubmit={handleSubmit}
        borderWidth={1}
        borderRadius="$4"
        backgroundColor="$background"
        borderColor="$borderColor"
        padding="$8"
        width="90%"
        maxWidth="800px"
      >
        <H4>{status === 'off' ? 'Login' : status[0].toUpperCase() + status.slice(1)}</H4>

        <Input
          placeholder="Email"
          value={formValues.email}
          onChangeText={(text) => handleInputChange('email', text)}
          keyboardType="email-address"
          size="$4"
          width="100%"
          padding="$2"
        />

        <Input
          placeholder="Password"
          value={formValues.password}
          onChangeText={(text) => handleInputChange('password', text)}
          secureTextEntry={true}
          size="$4"
          width="100%"
          padding="$2"
        />

        {Platform.OS === 'web' ? (
          <HCaptchaComponent
            sitekey={siteKey}
            onVerify={(captchaToken: string) => setCaptchaToken(captchaToken)}
          />
        ) : (
          <>
            {captchaStatus === 'waiting' && (
              <Button onPress={() => captchaForm.current?.show()}>Show hCaptcha</Button>
            )}

            {captchaStatus === 'success' && (
              <YStack alignItems="center">
                <CheckCircle color="green" size={40} />
                <Text>Verified!</Text>
              </YStack>
            )}

            {captchaStatus === 'error' && (
              <YStack alignItems="center">
                <XCircle color="red" size={40} />
                <Text>Error! Try Again</Text>
                <Button onPress={handleRetryCaptcha}>Retry</Button>
              </YStack>
            )}

            <ConfirmHcaptcha
              ref={captchaForm}
              siteKey={siteKey}
              baseUrl="https://hcaptcha.com"
              languageCode="en"
              onMessage={onMessage}
            />
          </>
        )}

        <Form.Trigger asChild disabled={status !== 'off' || captchaStatus !== 'success'}>
          <Button icon={status === 'loggingIn' ? () => <Spinner /> : undefined}>
            Login
          </Button>
        </Form.Trigger>
      </Form>

      {/* Feedback Sheet */}
      <Sheet
        modal
        open={showSheet}
        onOpenChange={setShowSheet}
        snapPoints={[80]}
        dismissOnOverlayPress={true}
      >
        <YStack justifyContent="center" alignItems="center" padding="$6" backgroundColor="$background" borderRadius="$4" width="100%">
          {captchaStatus === 'success' ? (
            <CheckCircle color="green" size={40} />
          ) : (
            <XCircle color="red" size={40} />
          )}
          <Text>{sheetMessage}</Text>
          <Button onPress={() => setShowSheet(false)}>Close</Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}

export default TamaLogin;
