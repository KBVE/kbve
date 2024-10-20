import React, { useEffect, useState, useRef } from 'react';
import { Platform, Linking } from 'react-native';
import { Button, Form, H4, Input, Spinner, Text, XStack, YStack, Sheet, Checkbox, Label } from 'tamagui';
import { CheckCircle, XCircle, Check } from '@tamagui/lucide-icons'; // Import Check for checkbox

// Import the hCaptcha components
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

// Import Supabase
import { createSupabaseClient } from '../wrapper/Supabase';

type HCaptchaType = typeof HCaptchaWeb | typeof ConfirmHcaptcha;

export function TamaRegister({ siteKey, supabaseUrl, supabaseAnonKey }: { siteKey: string, supabaseUrl: string, supabaseAnonKey: string }) {
  const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>('off');
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  });
  const [isAgreed, setIsAgreed] = useState(false);  // State for the agreement checkbox
  const [showSheet, setShowSheet] = useState(false); // State for the feedback sheet
  const [sheetMessage, setSheetMessage] = useState(''); // Message to display in the sheet
  const captchaForm = useRef<ConfirmHcaptcha | null>(null);
  const HCaptchaComponent: HCaptchaType = Platform.OS === 'web' ? HCaptchaWeb : ConfirmHcaptcha;

  // Initialize Supabase client
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

  useEffect(() => {
    if (status === 'submitting') {
      const timer = setTimeout(() => setStatus('off'), 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [status]);

  const handleSubmit = async () => {
    if (formValues.password !== formValues.passwordConfirm) {
      alert('Passwords do not match');
      return;
    }

    if (!captchaToken) {
      alert('Please complete the captcha');
      return;
    }

    if (!isAgreed) {
      alert('You must agree to the terms to register.');
      return;
    }

    setStatus('submitting');
    const lowercasedUsername = formValues.username.toLowerCase();
    console.log('Submitting form:', formValues.email, lowercasedUsername, 'Captcha:', captchaToken);

    const { email, password } = formValues;

    const username = lowercasedUsername;
    try {
      // Call Supabase's signUp method
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken,  // Pass the hCaptcha token
          data: {
            username,     // Custom user metadata
            full_name: username,  // Optionally store full name as username
          },
        },
      });

      if (error) {
        console.error('Supabase sign-up error:', error.message);
        setCaptchaStatus('waiting');  // Reset the captcha
        setSheetMessage(`Registration failed: ${error.message}`);
        setShowSheet(true);  // Show error sheet
      } else {
        console.log('User registered:', data);
        setStatus('submitted');
        setSheetMessage('Registration successful! Please check your email for a confirmation link.');
        setShowSheet(true);  // Show success sheet
      }
    } catch (error) {
      console.error('Error during registration:', error);
      setCaptchaStatus('waiting');  // Reset the captcha
      setSheetMessage('An error occurred during registration.');
      setShowSheet(true);  // Show error sheet
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

  const handleLinkPress = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      console.error(`Can't open URL: ${url}`);
    }
  };

  // Handle the checked state properly to match the type `CheckedState`
  const handleCheckboxChange = (checked: "indeterminate" | boolean) => {
    if (checked === "indeterminate") {
      setIsAgreed(false); // Handle indeterminate state as false
    } else {
      setIsAgreed(checked); // Set to true or false
    }
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
  width="90%" // Default to full width
  maxWidth="800px" // Set a max width to keep the form from getting too wide

>
        <H4>{status[0].toUpperCase() + status.slice(1)}</H4>

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
          secureTextEntry={true} 
          size="$4"
          width="100%"
          padding="$2"
        />

        <Input
          placeholder="Confirm Password"
          value={formValues.passwordConfirm}
          onChangeText={(text) => handleInputChange('passwordConfirm', text)}
          secureTextEntry={true}
          size="$4"
          width="100%"
          padding="$2"
        />

        <YStack marginVertical="$2" gap="$2">
          <Label>
            <XStack alignItems="center">
              <Checkbox checked={isAgreed} onCheckedChange={handleCheckboxChange}>
                {isAgreed && <Check />}
              </Checkbox>
              <Text paddingLeft="$2">
                I agree to the{' '}
                <Text onPress={() => handleLinkPress('https://kbve.com/legal/disclaimer/')} style={{ color: 'blue' }}>Disclaimer</Text>,{' '}
                <Text onPress={() => handleLinkPress('https://kbve.com/legal/eula/')} style={{ color: 'blue' }}>EULA</Text>,{' '}
                <Text onPress={() => handleLinkPress('https://kbve.com/legal/privacy/')} style={{ color: 'blue' }}>Privacy Policy</Text>, and{' '}
                <Text onPress={() => handleLinkPress('https://kbve.com/legal/tos/')} style={{ color: 'blue' }}>Terms of Service</Text>.
              </Text>
            </XStack>
          </Label>
        </YStack>

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
              <XStack alignItems="center">
                <XCircle color="red" size={40} />
                <Text>Error! Try Again</Text>
                <Button onPress={handleRetryCaptcha}>Retry</Button>
              </XStack>
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

        <Form.Trigger asChild disabled={status !== 'off' || !isAgreed}>
          <Button icon={status === 'submitting' ? () => <Spinner /> : undefined}>
            Register
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

export default TamaRegister;
