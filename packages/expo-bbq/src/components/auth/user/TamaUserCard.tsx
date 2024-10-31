import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { YStack, Input, Button, Text } from 'tamagui';
import { createSupabaseClient } from '../../wrapper/Supabase';

interface TamaUserCardProps {
	supabaseUrl: string;
	supabaseAnonKey: string;
	size?: string;
}

export const TamaUserCard: React.FC<TamaUserCardProps> = ({
	supabaseUrl,
	supabaseAnonKey,
	size = '$3',
}) => {
	const [bio, setBio] = useState<string>('');
	const [twitter, setTwitter] = useState<string>('');
	const [github, setGithub] = useState<string>('');
	const [linkedin, setLinkedin] = useState<string>('');
	const [website, setWebsite] = useState<string>('');
	const [colors, setColors] = useState<string[]>([]);
	const [cover, setCover] = useState<string>('');
	const [background, setBackground] = useState<string>('');
	const [error, setError] = useState<string | null>(null);

	const router = useRouter();
	const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

	const fetchUserCard = useCallback(async () => {
		try {
			const { data: session } = await supabase.auth.getSession();

			if (!session || !session.session) {
				router.replace('/login');
				return;
			}

			const { data: cardData, error: cardError } = await supabase
				.from('user_cards')
				.select('bio, socials, style')
				.eq('id', session.session.user.id)
				.single();

			if (cardError) throw cardError;

			setBio(cardData?.bio || '');
			if (cardData?.socials) {
				setTwitter(cardData.socials.twitter || '');
				setGithub(cardData.socials.github || '');
				setLinkedin(cardData.socials.linkedin || '');
				setWebsite(cardData.socials.website || '');
			}
			if (cardData?.style) {
				setColors(cardData.style.colors || []);
				setCover(cardData.style.cover || '');
				setBackground(cardData.style.background || '');
			}
		} catch (err) {
			setError('Error loading user card.');
			console.error(err);
		}
	}, [supabase, router]);

	useEffect(() => {
		fetchUserCard();
	}, [fetchUserCard]);

	const handleSubmit = async () => {
		try {
			const socials = { twitter, github, linkedin, website };
			const style = { colors, cover, background };

			const user = (await supabase.auth.getUser())?.data.user;

			if (user?.id) {
				const { error } = await supabase
					.from('user_cards')
					.update({ bio, socials, style })
					.eq('id', user.id);

				if (error) {
					setError('Error updating user card');
					console.error(error);
				} else {
					// Optional: add a success message or refresh the data
				}
			} else {
				setError('User is not logged in');
			}

			if (error) throw error;
		} catch (err) {
			setError('Error updating user card');
			console.error(err);
		}
	};

	return (
		<YStack padding="$4" gap={2}>
			<Text>Bio</Text>
			<Input
				flex={1}
				size={size}
				value={bio}
				onChangeText={setBio}
				maxLength={255}
			/>

			<Text>Twitter</Text>
			<Input
				flex={1}
				size={size}
				value={twitter}
				onChangeText={setTwitter}
				placeholder="Twitter URL"
			/>

			<Text>GitHub</Text>
			<Input
				flex={1}
				size={size}
				value={github}
				onChangeText={setGithub}
				placeholder="GitHub URL"
			/>

			<Text>LinkedIn</Text>
			<Input
				flex={1}
				size={size}
				value={linkedin}
				onChangeText={setLinkedin}
				placeholder="LinkedIn URL"
			/>

			<Text>Website</Text>
			<Input
				flex={1}
				size={size}
				value={website}
				onChangeText={setWebsite}
				placeholder="Website URL"
			/>

			<Text>Cover</Text>
			<Input
				flex={1}
				size={size}
				value={cover}
				onChangeText={setCover}
				placeholder="Cover Image"
			/>

			<Text>Background</Text>
			<Input
				flex={1}
				size={size}
				value={background}
				onChangeText={setBackground}
				placeholder="Background Image"
			/>

			<Text>Colors (comma-separated hex values)</Text>
			<Input
				flex={1}
				size={size}
				value={colors.join(', ')}
				onChangeText={(value) =>
					setColors(value.split(',').map((color) => color.trim()))
				}
				placeholder="e.g., #FFFFFF, #000000"
			/>

			{error && <Text>{error}</Text>}
			<Button onPress={handleSubmit}>Update Card</Button>
		</YStack>
	);
};

export default TamaUserCard;
