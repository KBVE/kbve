import React, { useState, useCallback, useMemo } from 'react';
import { YStack, Input, Button, TextArea, Text } from 'tamagui';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '../../wrapper/Supabase';

export function TamaOnboard({
	supabaseUrl,
	supabaseAnonKey,
}: {
	supabaseUrl: string;
	supabaseAnonKey: string;
}) {

    //  [States]
	const [step, setStep] = useState(1);
	const [username, setUsername] = useState('');
	const [bio, setBio] = useState('');
	const [socials, setSocials] = useState('');
	const [style, setStyle] = useState('');
	const [error, setError] = useState<string | null>(null);

    //  [Router] -> [could be swapped with the useBBQ]
	const router = useRouter();

    //  [Supabase]
	const supabase = useMemo(
		() => createSupabaseClient(supabaseUrl, supabaseAnonKey),
		[supabaseUrl, supabaseAnonKey],
	);

	// Handler to submit the username
	const handleUsernameSubmit = useCallback(async () => {
		try {
            
			const user = (await supabase.auth.getUser())?.data.user;

			const { error } = await supabase
				.from('user_profiles')
				.update({ username })
				.eq('id', user?.id);

			if (error) throw error;

			setStep(2); // Move to the next step for bio/socials
		} catch (err) {
			setError('Failed to set username. Please try again.');
			console.error(err);
		}
	}, [username, supabase]);

	// Handler to submit the user card details
	const handleUserCardSubmit = useCallback(async () => {
		try {

            const user = (await supabase.auth.getUser())?.data.user;


			const { error } = await supabase
				.from('user_profiles')
				.update({ bio, socials, style })
				.eq('id', user?.id);

			if (error) throw error;

			router.replace('/profile'); // Redirect to profile page after successful onboarding
		} catch (err) {
			setError('Failed to save user card details. Please try again.');
			console.error(err);
		}
	}, [bio, socials, style, supabase, router]);

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
					{error && <Text color="red">{error}</Text>}
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
					{error && <Text color="red">{error}</Text>}
					<Button onPress={handleUserCardSubmit}>
						Complete Onboarding
					</Button>
				</>
			)}
		</YStack>
	);
}

export default TamaOnboard;
