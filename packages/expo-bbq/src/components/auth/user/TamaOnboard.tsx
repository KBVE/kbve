import React, { useState, useCallback, useMemo } from 'react';
import { YStack, Input, Button, TextArea, Text } from 'tamagui';
import { createSupabaseClient } from '../../wrapper/Supabase';

export function TamaOnboard({
	supabaseUrl,
	supabaseAnonKey,
    onSuccess,
    onError,
}: {
	supabaseUrl: string;
	supabaseAnonKey: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
}) {

    //  [States]
	const [step, setStep] = useState(1);
	const [username, setUsername] = useState('');
	const [bio, setBio] = useState('');
	const [socials, setSocials] = useState('');
	const [style, setStyle] = useState('');

    //  [Supabase]
	const supabase = useMemo(
		() => createSupabaseClient(supabaseUrl, supabaseAnonKey),
		[supabaseUrl, supabaseAnonKey],
	);

    //  [User] -> Memoize the user object.
    const user = useMemo(async () => {
		return (await supabase.auth.getUser())?.data.user;
	}, [supabase]);


	// Handler to submit the username
	const handleUsernameSubmit = useCallback(async () => {
		try {
            
			const userData = await user;
			if (!userData) throw new Error('UserData not found');
            
			const { error } = await supabase
				.from('user_profiles')
				.update({ username })
				.eq('id', userData.id);

			if (error) throw error;

			setStep(2); // Move to the next step for bio/socials
		} catch (err) {
			if (onError) onError('Failed to set username. Please try again.');
			console.error(err);
		}
	}, [username, user, supabase, onError]);

	// Handler to submit the user card details
	const handleUserCardSubmit = useCallback(async () => {
		try {

            const userData = await user;
			if (!userData) throw new Error('UserData not found');
            
			const { error } = await supabase
				.from('user_profiles')
				.update({ bio, socials, style })
				.eq('id', userData.id);

			if (error) throw error;
            if (onSuccess) onSuccess();
		} catch (err) {
			if (onError) onError('Failed to save user card details. Please try again.');
			console.error(err);
		}
	}, [bio, socials, style, user, supabase, onSuccess, onError]);

	return (
		<YStack
			padding="$4"
			alignItems="center"
			justifyContent="center"
			flex={1}
			gap={2}>
			{step === 1 ? (
				<>
					<Text>Please choose your public username:</Text>
					<Input
						value={username}
						onChangeText={setUsername}
						placeholder="Username"
					/>
					
					<Button onPress={handleUsernameSubmit}>Next</Button>
				</>
			) : (
				<>
					<Text>Tell us more about yourself:</Text>
					<TextArea
						value={bio}
						onChangeText={setBio}
						placeholder="Write a short bio"
					/>
					<Input
						value={socials}
						onChangeText={setSocials}
						placeholder="Your social links"
					/>
					<Input
						value={style}
						onChangeText={setStyle}
						placeholder="Preferred style"
					/>
					<Button onPress={handleUserCardSubmit}>
						Complete Onboarding
					</Button>
				</>
			)}
		</YStack>
	);
}

export default TamaOnboard;
