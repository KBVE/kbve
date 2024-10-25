import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { BBQ } from '../../core/BBQ';

export const TamaSkeleton = () => {
	const isLoading = BBQ.getInstance().getLoadingState();

	if (!isLoading) return null;

	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
			<ActivityIndicator size="large" color="#0000ff" />
		</View>
	);
};

export default TamaSkeleton;
