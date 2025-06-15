import { supabase } from '../../supabaseClient';

const auth_url = import.meta.env.DEV ? 'http://localhost:4321/auth' : 'https://kbve.com/auth';

export async function signInWithDiscord() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: auth_url
    }
  });
  if (error) throw error;
  if (data?.url) window.location.href = data.url;
}

export async function signInWithGithub() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: auth_url
    }
  });
  if (error) throw error;
  if (data?.url) window.location.href = data.url;
}
