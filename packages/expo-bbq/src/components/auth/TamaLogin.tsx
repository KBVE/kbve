import React, { useEffect, useState, useRef, useMemo  } from 'react';
import { Button, Form, H4, Input, Spinner, Text, YStack, Sheet } from 'tamagui';
import { CheckCircle, XCircle, AlertTriangle } from '@tamagui/lucide-icons'; 
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '../wrapper/Supabase';
import { HCaptchaWrapper } from '../wrapper/HCaptchaWrapper'; 

export function TamaLogin({ siteKey, supabaseUrl, supabaseAnonKey }: { siteKey: string, supabaseUrl: string, supabaseAnonKey: string }) {
  const [status, setStatus] = useState<'off' | 'loggingIn' | 'loggedIn'>('off');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetCaptcha, setResetCaptcha] = useState(false);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });
  const [showSheet, setShowSheet] = useState(false); 
  const [sheetMessage, setSheetMessage] = useState('');
  
	const supabase = useMemo(() => createSupabaseClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);
  const router = useRouter();

  // Reset the status after a short delay
  useEffect(() => {
    if (status === 'loggingIn') {
      const timer = setTimeout(() => setStatus('off'), 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [status]);

  // Handle login submission
  const handleSubmit = async () => {
    if (!captchaToken) {
      setSheetMessage('Please complete the captcha!');
      setShowSheet(true);
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
        // Supabase login failed
        console.error('Supabase login error:', error.message);
        setSheetMessage(`Login failed: ${error.message}`);
        setShowSheet(true);
        setCaptchaToken(null);  // Reset captcha token after error
        // Trigger captcha reset after a short delay to ensure it gets picked up
        setTimeout(() => setResetCaptcha(true), 100);
      } else {
        // Login was successful
        setStatus('loggedIn');
        setSheetMessage('Login successful!');
        setShowSheet(true);
        router.replace('/profile');  // Redirect after successful login
      }
    } catch (error) {
      // General login error
      console.error('Error during login:', error);
      setSheetMessage('An error occurred during login.');
      setShowSheet(true);
      setCaptchaToken(null);  // Reset captcha token after error
      // Trigger captcha reset after a short delay
      setTimeout(() => setResetCaptcha(true), 100);
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


{!captchaToken && (
                <Button disabled size="$4" backgroundColor="transparent" icon={AlertTriangle}>
                  <Text color="red">Captcha needed before logging in</Text>
                </Button>
              )}
        

        {/* hCaptcha Wrapper to handle both web and mobile */}
        <HCaptchaWrapper
          siteKey={siteKey}
          onToken={(token) => {
            setCaptchaToken(token);  // Set the captcha token on success
            setResetCaptcha(false);  // Clear reset state when captcha is successful
          }}
          onError={(error) => {
            console.error('Captcha error:', error);  // Handle captcha errors
            setCaptchaToken(null);  // Reset token on error
            setSheetMessage('Captcha verification failed. Please try again.');
            setShowSheet(true);
          }}
          reset={resetCaptcha}  // Pass reset trigger to captcha wrapper
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
        forceRemoveScrollEnabled={showSheet}
        modal={true}
        open={showSheet}
        onOpenChange={setShowSheet}
        snapPoints={[80]}
        dismissOnOverlayPress={true}
        dismissOnSnapToBottom
        animation="medium"
      >
        <Sheet.Overlay
          animation="lazy"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle />
        <Sheet.Frame padding="$4" justifyContent="center" alignItems="center" gap="$5">
          {captchaToken ? (
            <CheckCircle color="green" size={40} />
          ) : (
            <XCircle color="red" size={40} />
          )}
          <Text>{sheetMessage}</Text>
          <Button onPress={() => setShowSheet(false)}>Close</Button>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  );
}

export default TamaLogin;
