import type { ReactNode } from 'react';
import { View } from 'react-native-web';

export function SafeAreaProvider({ children }: { children?: ReactNode }) {
	return <View>{children}</View>;
}

export const SafeAreaView = View;

export function useSafeAreaInsets() {
	return { top: 0, right: 0, bottom: 0, left: 0 };
}

export const initialWindowMetrics = {
	insets: { top: 0, right: 0, bottom: 0, left: 0 },
	frame: { x: 0, y: 0, width: 0, height: 0 },
};
