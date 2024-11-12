import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { YStack, Input, Button, TextArea, Text, Form as TamaguiForm, Spinner, SizableText } from 'tamagui';
import { createSupabaseClient } from '../../wrapper/Supabase';
import { userCardSchema } from './UserSchema';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { payloadInstance } from '../../../core/Payload';

type UserCardFormData = z.infer<typeof userCardSchema>;

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

	const [step, setStep] = useState(1);
	const [username, setUsername] = useState('');
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<'off' | 'submitting' | 'submitted'>('off');

	const supabase = useMemo(() => createSupabaseClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);

	const { register, handleSubmit, setValue, formState: { errors } } = useForm<UserCardFormData>({
		resolver: zodResolver(userCardSchema),
		defaultValues: { bio: '', socials: {}, style: {} },
	});


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

				if (data?.username) setStep(2);
			} catch (err) {
				if (onError) onError('Failed to check username. Please try again.');
				console.error('Error checking existing username:', err);
			} finally {
				setLoading(false);
			}
		};

		checkExistingUsername();
	}, [supabase, onError]);

	const handleUsernameSubmit = useCallback(async () => {
		try {
			const user = (await supabase.auth.getUser())?.data.user;
			if (!user) throw new Error('User data not found');

			const lowercasedUsername = username.toLowerCase();

			const { data, error } = await supabase
				.rpc('create_user_profile', { _username: lowercasedUsername });

			if (error) throw new Error(JSON.stringify(error));

			if (data && data.length > 0) setStep(2);
			else throw new Error('Update failed, no data returned');
		} catch (err) {
			if (onError) onError('Failed to set username. Please try again.');
			console.error('Error during username submission:', err);
		}
	}, [username, supabase, onError]);

	// Handler for user card submission
	const handleUserCardSubmit = useCallback(
		async (formData: UserCardFormData) => {
			setStatus('submitting');
			try {
				const user = (await supabase.auth.getUser())?.data.user;
				if (!user) throw new Error('User data not found');

				const payload = { id: user.id, ...payloadInstance.clean(formData) };
				console.log('Cleaned payload:', payload);

				const { data, error } = await supabase
					.from('user_cards')
					.upsert(payload, { onConflict: 'id' })
					.select();

				if (error) throw new Error(JSON.stringify(error));
				if (!data || data.length === 0) throw new Error('Failed to save user card details');

				setStatus('submitted');
				if (onSuccess) onSuccess();
			} catch (err) {
				setStatus('off');
				if (onError) onError('Failed to save user card details. Please try again.');
				console.error('Error during user card submission:', err);
			}
		},
		[supabase, onSuccess, onError]
	);

	if (loading) return <Text>Loading...</Text>;

	return (
		<YStack padding="$4" alignItems="center" justifyContent="center" flex={1} gap={2}>
			{step === 1 ? (
				<>
					<Text>Please choose your public username:</Text>
					<Input value={username} onChangeText={setUsername} placeholder="Username" />
					<Button onPress={handleUsernameSubmit}>Next</Button>
				</>
			) : (
				<TamaguiForm onSubmit={handleSubmit(handleUserCardSubmit)}>
					<Text>Tell us more about yourself:</Text>

					<TextArea 
						{...register('bio')} 
						placeholder="Write a short bio" 
						onChangeText={(text) => setValue('bio', text)}
					/>
					{errors.bio && <Text color="red">{errors.bio.message}</Text>}

					<Input 
						{...register('socials.twitter')} 
						placeholder="Twitter URL" 
						onChangeText={(text) => setValue('socials.twitter', text)} 
					/>
					{errors.socials?.twitter && <Text color="red">{errors.socials.twitter.message}</Text>}

					<Input 
						{...register('socials.github')} 
						placeholder="GitHub URL" 
						onChangeText={(text) => setValue('socials.github', text)} 
					/>
					{errors.socials?.github && <Text color="red">{errors.socials.github.message}</Text>}

					<Input 
						{...register('socials.linkedin')} 
						placeholder="LinkedIn URL" 
						onChangeText={(text) => setValue('socials.linkedin', text)} 
					/>
					{errors.socials?.linkedin && <Text color="red">{errors.socials.linkedin.message}</Text>}

					<Input 
						{...register('socials.website')} 
						placeholder="Website URL" 
						onChangeText={(text) => setValue('socials.website', text)} 
					/>
					{errors.socials?.website && <Text color="red">{errors.socials.website.message}</Text>}

					<TamaguiForm.Trigger asChild disabled={status !== 'off'}>
						<Button icon={status === 'submitting' ? () => <Spinner /> : undefined}>
							Complete Onboarding
						</Button>
					</TamaguiForm.Trigger>
				</TamaguiForm>
			)}
		</YStack>
	);
}

export default TamaOnboard;
