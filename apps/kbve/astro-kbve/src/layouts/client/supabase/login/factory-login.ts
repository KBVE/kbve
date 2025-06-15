import { emailAtom, passwordAtom, errorAtom, successAtom, loadingAtom, captchaTokenAtom } from './loginstatestate';
import { supabase } from '../supabaseClient';

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
