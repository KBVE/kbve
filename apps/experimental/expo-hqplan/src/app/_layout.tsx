/* eslint-disable jsx-a11y/accessible-emoji */
import React, {  } from 'react';
import {
	SafeAreaView,
	StatusBar,
} from 'react-native';
import NavBar from './_nav';
import { Slot } from 'expo-router';


export const App = () => {


	return (
		<>
			<StatusBar barStyle="dark-content" />
			<SafeAreaView className="flex-1">
				<Slot />
				<NavBar />
			</SafeAreaView>
		</>
	);
};
export default App;
