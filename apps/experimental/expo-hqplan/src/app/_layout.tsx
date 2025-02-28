/* eslint-disable jsx-a11y/accessible-emoji */
import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { Slot } from 'expo-router';

import '../global.css';

export const App = () => {
	return (
		<>
			<StatusBar barStyle="dark-content" />
			<SafeAreaView className="flex-1">
				<Slot />
			</SafeAreaView>
		</>
	);
};
export default App;
