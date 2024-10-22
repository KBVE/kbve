import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router'; // Assuming you're using Expo Router
import { YStack, H4, Avatar, Spinner, Text, Button, XStack } from 'tamagui';
import { createSupabaseClient } from '../wrapper/Supabase';
import { CheckCircle } from '@tamagui/lucide-icons'; // You can adjust icons if needed

export function TamaProfile({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string, supabaseAnonKey: string }) {
  const [loading, setLoading] = useState(true);
  const [userAuth, setUserAuth] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

  useEffect(() => {
    const fetchUserAuthAndProfile = async () => {
      try {
        // Get session information first
        const { data: session } = await supabase.auth.getSession();

        if (!session || !session.session) {
          router.replace('/login');  // If not logged in, redirect to login
          return;
        }

        // Fetch basic user identities
        const { data: identities, error: identityError } = await supabase.auth.getUserIdentities();

        if (identityError) {
          throw identityError;
        }

        const userIdentity = identities?.identities[0] || null;  // Get the first identity (e.g., email identity)

        // Set UserAuth state with basic user identity info
        setUserAuth(userIdentity);

        // Fetch the username from the 'user_profiles' table
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, username, updated_at')
          .eq('id', session.session.user.id)  // Use session.user.id for filtering
          .single();

        if (profileError) {
          throw profileError;
        }

        
        setUsername(profileData?.username ? profileData.username.charAt(0).toUpperCase() + profileData.username.slice(1) : null);
        
      } catch (err) {
        setError('Error fetching profile data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAuthAndProfile();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

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
        <Button onPress={() => router.replace('/login')}>Go to Login</Button>
      </YStack>
    );
  }

  return (
    <YStack justifyContent="center" alignItems="center" padding="$4" flex={1}>
      <Avatar circular size={100}>
        <Avatar.Image src={'https://example.com/default-avatar.png'} />
        <Avatar.Fallback>
          <Text>Hello</Text>
        </Avatar.Fallback>
      </Avatar>

      <H4 marginTop="$4">{username || userAuth?.identity_data?.email || 'Anonymous User'}</H4>
      <Text>{userAuth?.identity_data?.email}</Text>
      <Text>Email Verified: {userAuth?.identity_data?.email_verified ? 'Yes' : 'No'}</Text>

      <XStack justifyContent="center" alignItems="center" marginTop="$4" gap="$2">
        <CheckCircle color="green" size={24} />
        <Text>User ID: {userAuth?.user_id}</Text>
      </XStack>

      <Button marginTop="$6" onPress={handleLogout}>
        Logout
      </Button>
    </YStack>
  );
}

export default TamaProfile;
