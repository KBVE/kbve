import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function AuthSafeArea({ children }: { children: ReactNode }) {
	return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
