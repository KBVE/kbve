import { atom } from 'nanostores';
import { supabase } from '@kbve/astropad';

// State atoms
export const emailAtom = atom<string>("");
export const passwordAtom = atom<string>("");
export const errorAtom = atom<string>("");
export const successAtom = atom<string>("");
export const loadingAtom = atom<boolean>(false);
export const captchaTokenAtom = atom<string | null>(null);

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