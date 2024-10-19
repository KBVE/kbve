import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { CheckCircle, XCircle } from '@tamagui/lucide-icons'; // Assuming you're using Tamagui's icon pack

// Import the hCaptcha components statically
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

type HCaptchaType = typeof HCaptchaWeb | typeof ConfirmHcaptcha;

export function TamaRegister({ siteKey }: { siteKey: string }) {
  const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>('off');
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'success' | 'error'>('waiting'); // To track captcha status
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  });
  const captchaForm = useRef<ConfirmHcaptcha | null>(null); // Ref for mobile captcha

  const HCaptchaComponent: HCaptchaType = Platform.OS === 'web' ? HCaptchaWeb : ConfirmHcaptcha;

  useEffect(() => {
    if (status === 'submitting') {
      const timer = setTimeout(() => setStatus('off'), 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [status]);

  const handleSubmit = () => {
    if (formValues.password !== formValues.passwordConfirm) {
      alert('Passwords do not match');
      return;
    }

    if (!captchaToken) {
      alert('Please complete the captcha');
      return;
    }

    setStatus('submitting');
    console.log('Submitting form:', formValues, 'Captcha:', captchaToken);
    // Perform any registration logic here (e.g., API call)
  };

  const handleInputChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const onMessage = (event: any) => {
    const eventData = event?.nativeEvent?.data;

    if (eventData) {
      console.log('Event Data from hCaptcha:', eventData);

      // Ignore the 'open' event
      if (eventData === 'open') {
        return; // Ignore this event, as it's just the modal opening
      }

      // Handle cancellation, errors, or token expiration
      if (['cancel', 'error', 'expired'].includes(eventData)) {
        captchaForm.current?.hide();
        setCaptchaStatus('error'); // Set status to error
        console.log(`hCaptcha status: ${eventData}`);
      } else {
        // Handle successful verification
        console.log('Verified code from hCaptcha:', eventData);
        setCaptchaToken(eventData); // Set the token
        setCaptchaStatus('success'); // Set status to success
        captchaForm.current?.hide(); // Hide the modal only after successfully receiving the token
      }
    }
  };

  const handleRetryCaptcha = () => {
    setCaptchaStatus('waiting'); // Reset the status
    captchaForm.current?.show(); // Show the captcha modal again
  };

  return (
    <YStack
     
      justifyContent="center" // Center the form vertically
      alignItems="center" // Center the form horizontally
      padding="$4" // Add some padding for responsiveness
    >
      <Form
        alignItems="center"
        width={300} // Set a fixed width for the form
        gap="$4" // Uniform gap between elements
        onSubmit={handleSubmit}
        borderWidth={1}
        borderRadius="$4"
        backgroundColor="$background"
        borderColor="$borderColor"
        padding="$8"
      >
        <H4>{status[0].toUpperCase() + status.slice(1)}</H4>

        {/* Uniform Input Fields */}
        <Input
          placeholder="Email"
          value={formValues.email}
          onChangeText={(text) => handleInputChange('email', text)}
          keyboardType="email-address"
          size="$4" // Uniform size for all inputs
          width="100%" // Full width input
          padding="$2"
        />

        <Input
          placeholder="Username"
          value={formValues.username}
          onChangeText={(text) => handleInputChange('username', text)}
          size="$4"
          width="100%"
          padding="$2"
        />

        <Input
          placeholder="Password"
          value={formValues.password}
          onChangeText={(text) => handleInputChange('password', text)}
          secureTextEntry
          size="$4"
          width="100%"
          padding="$2"
        />

        <Input
          placeholder="Confirm Password"
          value={formValues.passwordConfirm}
          onChangeText={(text) => handleInputChange('passwordConfirm', text)}
          secureTextEntry
          size="$4"
          width="100%"
          padding="$2"
        />

        {/* hCaptcha */}
        {Platform.OS === 'web' ? (
          <HCaptchaComponent
            sitekey={siteKey} // Pass siteKey for web
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
              <XStack alignItems="center">
                <XCircle color="red" size={40} />
                <Text>Error! Try Again</Text>
                <Button onPress={handleRetryCaptcha}>Retry</Button>
              </XStack>
            )}

            <ConfirmHcaptcha
              ref={captchaForm}
              siteKey={siteKey} // Pass siteKey for mobile
              baseUrl="https://hcaptcha.com"
              languageCode="en"
              onMessage={onMessage}
            />
          </>
        )}

        {/* Submit Button */}
        <Form.Trigger asChild disabled={status !== 'off'}>
          <Button icon={status === 'submitting' ? () => <Spinner /> : undefined}>
            Register
          </Button>
        </Form.Trigger>
      </Form>
    </YStack>
  );
}

export default TamaRegister;
