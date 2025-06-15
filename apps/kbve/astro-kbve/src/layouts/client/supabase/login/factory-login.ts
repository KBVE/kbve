import { emailAtom, passwordAtom, errorAtom, successAtom, loadingAtom, captchaTokenAtom } from './loginstatestate';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY'); // Set your env vars

export async function loginUser() {
  const email = emailAtom.get();
  const password = passwordAtom.get();
  const captchaToken = captchaTokenAtom.get();
  errorAtom.set("");
  successAtom.set("");
  if (!email || !password) {
    errorAtom.set("Email and password are required.");
    return;
  }
  if (!captchaToken) {
    errorAtom.set("Please complete the hCaptcha challenge.");
    return;
  }
  loadingAtom.set(true);
  try {
    // Pass captchaToken in the options if your backend expects it
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken,
      },
    });
    if (signInError) throw signInError;
    successAtom.set("Login successful! Redirecting...");
    setTimeout(() => {
      window.location.href = "https://kbve.com/profile/";
    }, 1500);
  } catch (err: any) {
    errorAtom.set(err.message || "Login failed.");
  } finally {
    loadingAtom.set(false);
  }
}

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
