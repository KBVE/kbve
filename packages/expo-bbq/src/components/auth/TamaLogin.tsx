import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text, YStack, Sheet } from 'tamagui';
import { CheckCircle, XCircle } from '@tamagui/lucide-icons'; 
import { useRouter } from 'expo-router'; // Assuming you are using Expo Router
import { createSupabaseClient } from '../wrapper/Supabase';
import { HCaptchaWrapper } from '../wrapper/HCaptchaWrapper'; 

export function TamaLogin({ siteKey, supabaseUrl, supabaseAnonKey }: { siteKey: string, supabaseUrl: string, supabaseAnonKey: string }) {
  const [status, setStatus] = useState<'off' | 'loggingIn' | 'loggedIn'>('off');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });
  const [showSheet, setShowSheet] = useState(false); 
  const [sheetMessage, setSheetMessage] = useState('');
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          captchaToken, // Pass the hCaptcha token
        },
      });

      if (error) {
        console.error('Supabase login error:', error.message);
        setSheetMessage(`Login failed: ${error.message}`);
        setShowSheet(true);
        setCaptchaToken(null);  // Reset captcha token after error
      } else {
        setStatus('loggedIn');
        setSheetMessage('Login successful!');
        setShowSheet(true);
        router.replace('/profile');  // Redirect after successful login
      }
    } catch (error) {
      console.error('Error during login:', error);
      setSheetMessage('An error occurred during login.');
      setShowSheet(true);
      setCaptchaToken(null);  // Reset captcha token after error
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <YStack justifyContent="center" alignItems="center" padding="$4">
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

        {/* hCaptcha Wrapper to handle both web and mobile */}
        <HCaptchaWrapper
          siteKey={siteKey}
          onToken={(token) => {
            setCaptchaToken(token);  // Set the captcha token on success
          }}
          onError={(error) => {
            console.error('Captcha error:', error);  // Handle captcha errors
            setCaptchaToken(null);  // Reset token on error
          }}
        />

        <Form.Trigger
          asChild
          disabled={status === 'loggingIn' || !captchaToken}  // Disable button if logging in or no captcha token
        >
          <Button icon={status === 'loggingIn' ? () => <Spinner /> : undefined}>
            {status === 'loggingIn' ? 'Logging in...' : 'Login'}
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
          {captchaToken ? (
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
