import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import { View, Button, Text, YStack, Sheet } from 'tamagui'; // Use Tamagui components
import { CheckCircle, XCircle } from '@tamagui/lucide-icons'; // Tamagui icons for success/error states
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

interface HCaptchaWrapperProps {
  siteKey: string;
  onToken: (token: string) => void;   // Function to pass the token back
  onError?: (error: string) => void;  // Optional function to pass error back
}

export const HCaptchaWrapper: React.FC<HCaptchaWrapperProps> = ({ siteKey, onToken, onError }) => {
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false); // State to control sheet visibility
  const [sheetMessage, setSheetMessage] = useState('');
  const captchaForm = useRef<ConfirmHcaptcha | null>(null); // Ref for the mobile captcha

  const onVerify = (captchaToken: string) => {
    if (captchaToken) {
      setCaptchaToken(captchaToken);
      onToken(captchaToken); // Pass the token back to the parent component
      setCaptchaStatus('success'); // Update status to success
      setSheetMessage('Captcha verified successfully!');
      setShowSheet(true); // Show success sheet
    }
  };

  const onErrorHandler = (err: any) => {
    console.error('hCaptcha error:', err);
    const errorMessage = err.message || 'Error with hCaptcha';
    setCaptchaStatus('error');
    if (onError) onError(errorMessage); // Pass the error back to the parent
    setSheetMessage(`Error: ${errorMessage}`);
    setShowSheet(true); // Show error sheet
  };

  const onMessage = (event: any) => {
    const eventData = event?.nativeEvent?.data;

    if (eventData) {
      if (['cancel', 'error', 'expired'].includes(eventData)) {
        captchaForm.current?.hide();
        setCaptchaStatus('error');
        setSheetMessage('Captcha error. Please try again.');
        setShowSheet(true);
      } else {
        setCaptchaToken(eventData);
        setCaptchaStatus('success');
        captchaForm.current?.hide();
        onToken(eventData);
        setSheetMessage('Captcha verified successfully!');
        setShowSheet(true);
      }
    }
  };

  const openCaptcha = () => {
    if (Platform.OS === 'web') {
      setCaptchaStatus('waiting'); // Show the captcha for web
    } else {
      // On mobile, explicitly show the captcha using ref
      setCaptchaStatus('waiting');
      captchaForm.current?.show(); // Show mobile captcha manually
    }
  };

  const handleRetryCaptcha = () => {
    setCaptchaStatus('waiting');
    captchaForm.current?.show(); // Retry captcha on mobile
  };

  return (
    <YStack alignItems="center" justifyContent="center" padding="$4">
      {captchaStatus === 'waiting' ? (
        Platform.OS === 'web' ? (
          <HCaptchaWeb
            sitekey={siteKey}
            onVerify={onVerify}
            onError={onErrorHandler}  // Handle error in web version
          />
        ) : (
          <ConfirmHcaptcha
            ref={captchaForm}
            siteKey={siteKey}
            baseUrl="https://hcaptcha.com"
            size="invisible"  // Added size prop for mobile
            languageCode="en"
            onMessage={onMessage}  // Handle verification and errors for mobile
          />
        )
      ) : captchaStatus === 'success' ? (
        <YStack alignItems="center">
          <CheckCircle color="green" size={40} />
          <Text>Verified!</Text>
        </YStack>
      ) : captchaStatus === 'error' ? (
        <YStack alignItems="center">
          <XCircle color="red" size={40} />
          <Text>Error! Try Again</Text>
          <Button onPress={handleRetryCaptcha}>Retry</Button>
        </YStack>
      ) : null}

      {captchaStatus === 'waiting' && (
        <Button onPress={openCaptcha}>Open hCaptcha</Button>
      )}

      {/* Sheet for showing feedback after captcha completion */}
      <Sheet
        modal
        open={showSheet}
        onOpenChange={setShowSheet}
        snapPoints={[80]}  // Adjust snap points as needed
        dismissOnOverlayPress={true}
      >
        <YStack justifyContent="center" alignItems="center" padding="$6">
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
};

export default HCaptchaWrapper;
