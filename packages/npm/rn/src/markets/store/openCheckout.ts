import { Linking } from 'react-native';

export function openCheckout(url: string): void {
	void Linking.openURL(url);
}
