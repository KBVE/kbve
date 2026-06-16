import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

// phone < 768 <= tablet < 1024 <= desktop
export function useBreakpoint(): {
	bp: Breakpoint;
	width: number;
	isDesktop: boolean;
	isTablet: boolean;
	isPhone: boolean;
} {
	const { width } = useWindowDimensions();
	const bp: Breakpoint =
		width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'phone';
	return {
		bp,
		width,
		isDesktop: bp === 'desktop',
		isTablet: bp === 'tablet',
		isPhone: bp === 'phone',
	};
}
