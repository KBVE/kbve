// 'react-native' resolution target for the webview. react-native-web plus
// the native-runtime globals RN libraries (reanimated, svg, safe-area)
// import but never actually use on web.
import * as RNW from 'react-native-web';

export * from 'react-native-web';
export default RNW;

export const TurboModuleRegistry = {
	get: (_name: string) => null,
	getEnforcing: (_name: string) => ({}),
};
