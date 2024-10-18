import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text } from 'tamagui';
import { Sheet, setupNativeSheet } from '@tamagui/sheet';
import { ModalView } from 'react-native-ios-modal';

// Import the hCaptcha components statically
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

// Set up native sheet for iOS
setupNativeSheet('ios', ModalView);

type HCaptchaType = typeof HCaptchaWeb | typeof ConfirmHcaptcha;

export function TamaRegister({ siteKey }: { siteKey: string }) {
  const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>('off');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  });
  const captchaForm = useRef<ConfirmHcaptcha | null>(null); // Ref for mobile captcha
  const [isSheetOpen, setIsSheetOpen] = useState(false); // State to control the Sheet open/close

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
      if (['cancel', 'error', 'expired'].includes(eventData)) {
        captchaForm.current?.hide();
        console.log(`hCaptcha status: ${eventData}`);
      } else {
        console.log('Verified code from hCaptcha:', eventData);
        setCaptchaToken(eventData); // Set the token
        captchaForm.current?.hide(); // Hide the modal only after successfully receiving the token
        setIsSheetOpen(false); // Close the Tamagui Sheet when captcha is successfully validated
      }
    }
  };

  return (
    <Form
      alignItems="center"
      minWidth={300}
      gap="$2"
      onSubmit={handleSubmit}
      borderWidth={1}
      borderRadius="$4"
      backgroundColor="$background"
      borderColor="$borderColor"
      padding="$8"
    >
      <H4>{status[0].toUpperCase() + status.slice(1)}</H4>

      {/* Email Field */}
      <Input
        placeholder="Email"
        value={formValues.email}
        onChangeText={(text) => handleInputChange('email', text)}
        keyboardType="email-address"
      />

      {/* Username Field */}
      <Input
        placeholder="Username"
        value={formValues.username}
        onChangeText={(text) => handleInputChange('username', text)}
      />

      {/* Password Field */}
      <Input
        placeholder="Password"
        value={formValues.password}
        onChangeText={(text) => handleInputChange('password', text)}
        secureTextEntry
      />

      {/* Password Confirm Field */}
      <Input
        placeholder="Confirm Password"
        value={formValues.passwordConfirm}
        onChangeText={(text) => handleInputChange('passwordConfirm', text)}
        secureTextEntry
      />

      {/* hCaptcha */}
      {Platform.OS === 'web' ? (
        <HCaptchaComponent
          sitekey={siteKey} // Pass siteKey for web
          onVerify={(captchaToken: string) => setCaptchaToken(captchaToken)}
        />
      ) : (
        <>
          <Button onPress={() => setIsSheetOpen(true)}>Show hCaptcha</Button>
          
          {/* Tamagui Sheet with native iOS modal support */}
          <Sheet
            native
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            snapPoints={[85, 50]}
          >
            <Sheet.Frame padding="$4" justifyContent="center" alignItems="center" space="$5">
              <ConfirmHcaptcha
                ref={captchaForm}
                siteKey={siteKey} // Pass siteKey for mobile
                baseUrl="https://hcaptcha.com"
                languageCode="en"
                onMessage={onMessage}
              />
              <Button size="$6" circular onPress={() => setIsSheetOpen(false)}>
                Close
              </Button>
            </Sheet.Frame>
          </Sheet>
        </>
      )}

      {/* Submit Button */}
      <Form.Trigger asChild disabled={status !== 'off'}>
        <Button icon={status === 'submitting' ? () => <Spinner /> : undefined}>
          Register
        </Button>
      </Form.Trigger>
    </Form>
  );
}

export default TamaRegister;
