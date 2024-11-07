import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router'; // Assuming you're using Expo Router
import { YStack, H4, Spinner, Text, Button, YGroup, ListItem } from 'tamagui';
import { createSupabaseClient } from '../wrapper/Supabase';
import { CheckCircle, Mail, User, XCircle } from '@tamagui/lucide-icons'; // Adjust icons as needed

export function TamaProfile({
	supabaseUrl,
	supabaseAnonKey,
}: {
	supabaseUrl: string;
	supabaseAnonKey: string;
}) {
	const [loading, setLoading] = useState(true);
	const [userAuth, setUserAuth] = useState<any>(null);
	const [username, setUsername] = useState<string | null>(null);
	const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const supabase = useMemo(() => createSupabaseClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);

	const formattedLastSignInAt = useMemo(() => {
		return lastSignInAt ? new Date(lastSignInAt).toLocaleString() : 'Unknown';
	}, [lastSignInAt]);

	const fetchUserAuthAndProfile = useCallback(async () => {
		try {
			const { data: session } = await supabase.auth.getSession();

			if (!session || !session.session) {
				//router.replace('/login'); // If not logged in, redirect to login
				return;
			}

			const lastSignIn = session.session.user?.last_sign_in_at || null;
			setLastSignInAt(lastSignIn);

			const { data: identities, error: identityError } =
				await supabase.auth.getUserIdentities();

			if (identityError) {
				throw identityError;
			}

			const userIdentity = identities?.identities[0] || null;

			setUserAuth(userIdentity);

			const { data: profileData, error: profileError } =
				await supabase
					.from('user_profiles')
					.select('id, username, updated_at')
					.eq('id', session.session.user.id) // Use session.user.id for filtering
					.single();

			if (profileError) {
				throw profileError;
			}

			setUsername(
				profileData?.username
					? profileData.username.charAt(0).toUpperCase() +
							profileData.username.slice(1)
					: null,
			);
		} catch (err) {
			setError('Error fetching profile data');
			console.error(err);
		} finally {
			setLoading(false);
		}
	}, [supabase, router]);

	useEffect(() => {
		fetchUserAuthAndProfile();
	}, [fetchUserAuthAndProfile]);

	const handleLogout = useCallback(async () => {
		try {
			await supabase.auth.signOut();
			router.replace('/login');
		} catch (err) {
			console.error('Error during logout:', err);
		}
	}, [supabase, router]);

	if (loading) {
		return (
			<YStack justifyContent="center" alignItems="center" flex={1}>
				<Spinner size="large" />
				<Text>Loading profile...</Text>
			</YStack>
		);
	}

	if (error) {
		return (
			<YStack justifyContent="center" alignItems="center" flex={1}>
				<Text>{error}</Text>
				<Button onPress={() => router.replace('/login')}>
					Go to Login
				</Button>
			</YStack>
		);
	}
  

	return (
		<YStack
			justifyContent="center"
			alignItems="center"
			padding="$4"
			flex={1}
			gap={1}>
			<H4 marginBottom="$2">Profile Information</H4>

			<YGroup bordered width={350} alignSelf="center" gap={5}>
				<YGroup.Item>
					<ListItem
						icon={User}
						title="Username"
						subTitle={username || 'Anonymous User'}
					/>
				</YGroup.Item>

				<YGroup.Item>
					<ListItem
						icon={Mail}
						title="Email"
						subTitle={
							userAuth?.identity_data?.email ||
							'No email provided'
						}
					/>
				</YGroup.Item>

				<YGroup.Item>
					<ListItem
						icon={
							userAuth?.identity_data?.email_verified ? (
								<CheckCircle color="green" />
							) : (
								<XCircle color="red" />
							)
						}
						title="Email Verified"
						subTitle={
							userAuth?.identity_data?.email_verified
								? 'Yes'
								: 'No'
						}
					/>
				</YGroup.Item>

				<YGroup.Item>
					<ListItem
						icon={<CheckCircle color="green" />}
						title="User ID"
						subTitle={userAuth?.user_id}
					/>
				</YGroup.Item>

				<YGroup.Item>
					<ListItem
						icon={<CheckCircle color="green" />}
						title="Last Sign-In"
						subTitle={formattedLastSignInAt}
					/>
				</YGroup.Item>

			</YGroup>

			<Button marginTop="$6" onPress={handleLogout}>
				Logout
			</Button>
		</YStack>
	);
}

export default TamaProfile;
