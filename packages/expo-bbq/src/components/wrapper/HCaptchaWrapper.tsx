import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { YStack, Button, Text } from 'tamagui';
import { CheckCircle, XCircle } from '@tamagui/lucide-icons';
import HCaptchaWeb from '@hcaptcha/react-hcaptcha';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

interface HCaptchaWrapperProps {
  siteKey: string;
  onToken: (token: string) => void; // Function to pass the token back
  onError?: (error: string) => void; // Optional function to pass error back
  reset?: boolean; // Optional prop to trigger reset
}

export const HCaptchaWrapper: React.FC<HCaptchaWrapperProps> = ({
  siteKey,
  onToken,
  onError,
  reset, // Pass a reset prop from parent
}) => {
  const [captchaStatus, setCaptchaStatus] = useState<'waiting' | 'verified' | 'error' | 'loading'>('waiting');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false); // Track mounting status
  const captchaForm = useRef<ConfirmHcaptcha | null>(null); // Ref for mobile captcha

  useEffect(() => {
    setIsMounted(true); // Mark the component as mounted
    return () => {
      setIsMounted(false); // Clean up on unmount
    };
  }, []);

  // Memoize the resetCaptcha function with useCallback
  const resetCaptcha = useCallback(() => {
    if (isMounted) { // Ensure component is mounted before resetting
      setCaptchaStatus('waiting');
      setCaptchaToken(null);
    }
  }, [isMounted]);

  // Only called when we actually receive a token from captcha
  const onVerify = (captchaToken: string) => {
    if (isMounted && captchaToken) { // Ensure component is mounted
      setCaptchaToken(captchaToken); // Store the token
      setCaptchaStatus('verified'); // Mark as verified
      onToken(captchaToken); // Pass token back to parent
    }
  };

  // Handles errors for both web and mobile
  const onErrorHandler = (err: any) => {
    if (isMounted) { // Only update state if mounted
      const errorMessage = err.message || 'Error with hCaptcha';
      setCaptchaStatus('error');
      if (onError) onError(errorMessage); // Pass the error back to parent
    }
  };

  // Handles mobile captcha events through onMessage
  const onMessage = (event: any) => {
    if (!isMounted) return; // Only handle messages if component is mounted

    const eventData = event?.nativeEvent?.data;

    if (eventData === 'open') {
      return; // Keep the captcha modal open
    }

    if (['cancel', 'error', 'expired'].includes(eventData)) {
      captchaForm.current?.hide();
      setCaptchaStatus('error');
      if (onError) onError(eventData); // Pass error to parent
    } else if (eventData) {
      setCaptchaToken(eventData); // Store token for mobile
      setCaptchaStatus('verified'); // Mark as verified
      captchaForm.current?.hide();
      onToken(eventData); // Pass token to parent
    }
  };

  const openCaptcha = () => {
    if (isMounted) { // Only open captcha if component is mounted
      setCaptchaStatus('loading'); // Loading state while opening
      captchaForm.current?.show(); // Show mobile captcha manually using ref
    }
  };

  const handleRetryCaptcha = () => {
    if (isMounted) { // Only retry captcha if mounted
      setCaptchaStatus('waiting');
      captchaForm.current?.reset(); // Reset and retry on mobile
    }
  };

  // Use useEffect to reset when the reset prop changes
  useEffect(() => {
    if (reset) {
      resetCaptcha(); // Trigger reset when the reset prop changes
    }
  }, [reset, resetCaptcha]);

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
    </YStack>
  );
};

export default HCaptchaWrapper;
