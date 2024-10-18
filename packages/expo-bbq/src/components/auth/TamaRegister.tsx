import React, { useEffect, useState, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text } from 'tamagui';

// Import the hCaptcha components statically
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

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
    if (event && event.nativeEvent?.data) {
      if (['cancel', 'error'].includes(event.nativeEvent.data)) {
        captchaForm.current?.hide();
        if (event.nativeEvent.data === 'error') {
          console.error('hCaptcha error');
        }
      } else {
        const token = event.nativeEvent.data;
        setCaptchaToken(token);
        captchaForm.current?.hide();
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
          <ConfirmHcaptcha
            ref={captchaForm}
            siteKey={siteKey} // Pass siteKey for mobile
            baseUrl="https://hcaptcha.com"
            languageCode="en"
            onMessage={onMessage}
          />
          {/* Button to trigger the modal for mobile */}
          <Button onPress={() => captchaForm.current?.show()}>Show hCaptcha</Button>
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
