import { Platform, useWindowDimensions } from 'react-native';
import type { RailExpandTrigger } from './models';

const DESKTOP_MIN_WIDTH = 768;

export interface RailPlatform {
	os: typeof Platform.OS;
	isWeb: boolean;
	isMobile: boolean;
	isDesktop: boolean;
	canHover: boolean;
	canDrag: boolean;
	defaultTrigger: RailExpandTrigger;
}

export function useRailPlatform(): RailPlatform {
	const { width } = useWindowDimensions();
	const os = Platform.OS;
	const isWeb = os === 'web';
	const isDesktop = isWeb && width >= DESKTOP_MIN_WIDTH;
	const canHover = isDesktop;
	return {
		os,
		isWeb,
		isMobile: !isDesktop,
		isDesktop,
		canHover,
		canDrag: isDesktop,
		defaultTrigger: canHover ? 'hover' : 'press',
	};
}
