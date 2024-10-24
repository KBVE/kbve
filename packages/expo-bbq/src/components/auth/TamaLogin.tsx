import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Button, Form, H4, Input, Spinner, Text, YStack } from 'tamagui';
import { CheckCircle, XCircle, AlertTriangle } from '@tamagui/lucide-icons'; 
import { createSupabaseClient } from '../wrapper/Supabase';
import { HCaptchaWrapper } from '../wrapper/HCaptchaWrapper';

export function TamaLogin({
  siteKey,
  supabaseUrl,
  supabaseAnonKey,
  onSuccess,
  onError,
}: {
  siteKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  onSuccess?: () => void;  // Optional success callback
  onError?: (error: string) => void;  // Optional error callback
}) {
  const [status, setStatus] = useState<'off' | 'loggingIn' | 'loggedIn'>('off');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetCaptcha, setResetCaptcha] = useState(false);
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
  });

  const supabase = useMemo(() => createSupabaseClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);
  const isMounted = useRef(true);

  // Cleanup on unmount to prevent state updates on an unmounted component
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

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
      if (onError) {
        onError('Please complete the captcha!');
      }
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
        if (onError) {
          onError(`Login failed: ${error.message}`);
        }
        setCaptchaToken(null);  // Reset captcha token after error
        setTimeout(() => setResetCaptcha(true), 100);  // Trigger captcha reset
      } else {
        // Login was successful
        setStatus('loggedIn');
        if (onSuccess) {
          onSuccess();  // Call the success callback if provided
        }
      }
    } catch (error) {
      // General login error
      console.error('Error during login:', error);
      if (onError) {
        onError('An error occurred during login.');
      }
      setCaptchaToken(null);  // Reset captcha token after error
      setTimeout(() => setResetCaptcha(true), 100);  // Trigger captcha reset
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
            if (onError) {
              onError('Captcha verification failed. Please try again.');
            }
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
    </YStack>
  );
}

export default TamaLogin;
