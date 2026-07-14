import * as WebBrowser from 'expo-web-browser';

export function openExternal(url: string): void {
	void WebBrowser.openBrowserAsync(url);
}
