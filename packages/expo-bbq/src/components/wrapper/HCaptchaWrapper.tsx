import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Text } from 'tamagui';

interface HCaptchaWrapperProps {
  siteKey: string;
  onToken: (token: string) => void;   // Function to pass the token back
  onError?: (error: string) => void;  // Optional function to pass error back
}

export const HCaptchaWrapper: React.FC<HCaptchaWrapperProps> = ({ siteKey, onToken, onError }) => {
  const [HCaptchaComponent, setHCaptchaComponent] = useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHCaptcha = async () => {
      try {
        if (Platform.OS === 'web') {
          const { default: HCaptchaWeb } = await require('@hcaptcha/react-hcaptcha');
          setHCaptchaComponent(() => HCaptchaWeb);
        } else {
          const { default: HCaptchaMobile } = await require('@hcaptcha/react-native-hcaptcha');
          setHCaptchaComponent(() => HCaptchaMobile);
        }
      } catch (loadError) {
        console.error('Error loading hCaptcha component:', loadError);
        setError('Failed to load hCaptcha');
        if (onError) onError('Failed to load hCaptcha');
      }
    };

    loadHCaptcha();
  }, [onError]);

  const onVerify = (captchaToken: string) => {
    if (captchaToken) {
      onToken(captchaToken); // Pass the token back to the parent component
    }
  };

  const onErrorHandler = (err: any) => {
    console.error('hCaptcha error:', err);
    const errorMessage = err.message || 'Error with hCaptcha';
    setError(errorMessage);
    if (onError) onError(errorMessage); // Pass the error back to the parent
  };

  return (
    <View>
      {HCaptchaComponent ? (
        Platform.OS === 'web' ? (
          <HCaptchaComponent
            sitekey={siteKey}
            onVerify={onVerify}
            onError={onErrorHandler}  // Handle error in web version
          />
        ) : (
          <HCaptchaComponent
            siteKey={siteKey}
            baseUrl="https://hcaptcha.com"
            onMessage={(event: any) => {
              const eventData = event.nativeEvent.data;
              if (eventData === 'error' || eventData === 'expired') {
                onErrorHandler(eventData);
              } else {
                onVerify(eventData);
              }
            }} // Handle verification and errors for mobile
          />
        )
      ) : (
        <Text>Loading hCaptcha...</Text>
      )}

      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  );
};

export default HCaptchaWrapper;
