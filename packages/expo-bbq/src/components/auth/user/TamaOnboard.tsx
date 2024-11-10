import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
    const [loading, setLoading] = useState(true);


    //  [Supabase]
	const supabase = useMemo(
		() => createSupabaseClient(supabaseUrl, supabaseAnonKey),
		[supabaseUrl, supabaseAnonKey],
	);

    //  [User] -> Memoize the user object.
    // const user = useMemo(async () => {
	// 	return (await supabase.auth.getUser())?.data.user;
	// }, [supabase]);


        // Check if username is already set
	useEffect(() => {
		const checkExistingUsername = async () => {
			try {
				const user = (await supabase.auth.getUser())?.data.user;
				if (!user) throw new Error('User data not found');

				const { data, error } = await supabase
					.from('user_profiles')
					.select('username')
					.eq('id', user.id)
					.single();

				if (error) throw new Error(error.message);

				// If username exists, skip to step 2
				if (data?.username) {
					setStep(2);
				}
			} catch (err) {
				if (onError) onError('Failed to check username. Please try again.');
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		checkExistingUsername();
	}, [supabase, onError]);

	// Handler to submit the username
    const handleUsernameSubmit = useCallback(async () => {
        try {
            const user = (await supabase.auth.getUser())?.data.user;
            if (!user) throw new Error('User data not found');
    
            // Lowercase the username for consistency
            const lowercasedUsername = username.toLowerCase();
    
            
            // Call the stored function to handle the new user profile
            const { data, error } = await supabase
            .rpc('create_user_profile', { _username: lowercasedUsername });

            
            if (error) throw new Error(JSON.stringify(error));
    
            // Check if data was returned to confirm successful update
            if (data && data.length > 0) {
                setStep(2); // Move to the next step for bio/socials
            } else {
                throw new Error('Update failed, no data returned');
            }
        } catch (err) {
            if (onError) onError('Failed to set username. Please try again.');
            console.error(err);
        }
    }, [username, supabase, onError]);
    
	// Handler to submit the user card details
    const handleUserCardSubmit = useCallback(async () => {
        try {
            const user = (await supabase.auth.getUser())?.data.user;
            if (!user) throw new Error('User data not found');
    
            // Prepare the payload, excluding `socials` and `style` if they're empty
            const payload: Record<string, any> = { id: user.id, bio };
            if (socials) payload.socials = socials;
            if (style) payload.style = style;
    
            // Use upsert to insert or update the row
            const { data, error } = await supabase
                .from('user_cards')
                .upsert(payload, { onConflict: 'id' }) // Handle conflicts based on the user's id
                .select();
    
            if (error) throw new Error(JSON.stringify(error));
            if (!data || data.length === 0) throw new Error('Failed to save user card details');
    
            if (onSuccess) onSuccess();
        } catch (err) {
            if (onError) onError('Failed to save user card details. Please try again.');
            console.error(err);
        }
    }, [bio, socials, style, supabase, onSuccess, onError]);
    

    if (loading) {
		return <Text>Loading...</Text>;
	}

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
