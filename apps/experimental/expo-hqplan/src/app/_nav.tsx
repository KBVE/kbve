/* eslint-disable jsx-a11y/accessible-emoji */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

const NavBar = () => {
    const router = useRouter();

    return (
        <View className="absolute bottom-5 left-5 right-5 bg-white rounded-full shadow-lg flex-row justify-around p-4">
            <TouchableOpacity onPress={() => router.push('/')}>
                <Text className="text-lg">🏠</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/search')}>
                <Text className="text-lg">🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/profile')}>
                <Text className="text-lg">👤</Text>
            </TouchableOpacity>
        </View>
    );
};

export default NavBar;
