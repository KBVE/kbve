import React, { useState, useRef } from 'react';
import { Platform } from 'react-native';
import { YStack, Button, Text, Sheet } from 'tamagui';
import { CheckCircle, XCircle } from '@tamagui/lucide-icons';
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

interface HCaptchaWrapperProps {
  siteKey: string;
  onToken: (token: string) => void; // Function to pass the token back
  onError?: (error: string) => void; // Optional function to pass error back
}

export const HCaptchaWrapper: React.FC<HCaptchaWrapperProps> = ({
  siteKey,
  onToken,
  onError,
}) => {
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'verified' | 'error' | 'loading'>('waiting');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false); // Control sheet visibility
  const [sheetMessage, setSheetMessage] = useState('');
  const captchaForm = useRef<ConfirmHcaptcha | null>(null); // Ref for mobile captcha

  // Only called when we actually receive a token from captcha
  const onVerify = (captchaToken: string) => {
    if (captchaToken) {
      console.log('Captcha token received:', captchaToken);
      setCaptchaToken(captchaToken); // Store the token
      setCaptchaStatus('verified'); // Mark as verified
      onToken(captchaToken); // Pass token back to parent
      setSheetMessage('Captcha verified successfully!');
      setShowSheet(true); // Show success message
    }
  };

  // Handles errors for both web and mobile
  const onErrorHandler = (err: any) => {
    console.error('hCaptcha error:', err);
    const errorMessage = err.message || 'Error with hCaptcha';
    setCaptchaStatus('error');
    if (onError) onError(errorMessage); // Pass the error back to parent
    setSheetMessage(`Error: ${errorMessage}`);
    setShowSheet(true); // Show error message
  };

  // Handles mobile captcha events through onMessage
  const onMessage = (event: any) => {
    const eventData = event?.nativeEvent?.data;

    console.log('Mobile captcha event received:', eventData);

    // Only close or hide the captcha on relevant events
    if (eventData === 'open') {
      console.log('Captcha opened');
      return; // Keep the captcha modal open
    }

    if (['cancel', 'error', 'expired'].includes(eventData)) {
      captchaForm.current?.hide();
      setCaptchaStatus('error');
      setSheetMessage('Captcha error. Please try again.');
      setShowSheet(true);
    } else if (eventData) {
      console.log('Captcha token received on mobile:', eventData);
      setCaptchaToken(eventData); // Store token for mobile
      setCaptchaStatus('verified'); // Mark as verified
      captchaForm.current?.hide();
      onToken(eventData);
      setSheetMessage('Captcha verified successfully!');
      setShowSheet(true);
    }
  };

  const openCaptcha = () => {
    setCaptchaStatus('loading'); // Loading state while opening
    captchaForm.current?.show(); // Show mobile captcha manually using ref
  };

  const handleRetryCaptcha = () => {
    setCaptchaStatus('waiting');
    captchaForm.current?.show(); // Retry on mobile
  };

  return (
    <YStack alignItems="center" justifyContent="center" padding="$4">
      {captchaStatus === 'waiting' || captchaStatus === 'loading' ? (
        Platform.OS === 'web' ? (
          <HCaptchaWeb
            sitekey={siteKey}
            onVerify={onVerify} // Only verified when token is returned
            onError={onErrorHandler} // Handle error for web
          />
        ) : (
          <ConfirmHcaptcha
            ref={captchaForm}
            siteKey={siteKey}
            baseUrl="https://hcaptcha.com"
            size="invisible" // Mobile captcha size
            languageCode="en"
            onMessage={onMessage} // Handle mobile verification events
          />
        )
      ) : captchaStatus === 'verified' ? (
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

      {/* Show the "Open Captcha" button only on mobile */}
      {Platform.OS !== 'web' && captchaStatus === 'waiting' && (
        <Button onPress={openCaptcha}>Open hCaptcha</Button>
      )}

      {/* Sheet for displaying feedback */}
      <Sheet
        modal
        open={showSheet}
        onOpenChange={setShowSheet}
        snapPoints={[80]}
        dismissOnOverlayPress={true}
      >
        <YStack justifyContent="center" alignItems="center" padding="$6" backgroundColor="$background" borderRadius="$4" width="100%">
          {captchaStatus === 'verified' ? (
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
