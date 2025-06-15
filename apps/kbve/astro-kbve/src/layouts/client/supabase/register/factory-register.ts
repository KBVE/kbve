import { emailAtom, passwordAtom, confirmPasswordAtom, agreedAtom, captchaTokenAtom, errorAtom, successAtom, loadingAtom } from './registerstate';
import { createClient } from '@supabase/supabase-js';
import { task } from 'nanostores';

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY'); // Set your env vars

export async function checkIfLoggedInAndRedirect() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    successAtom.set("You are already logged in. Redirecting to your profile...");
    setTimeout(() => {
      window.location.href = "https://kbve.com/profile/";
    }, 1500);
    return true;
  }
  return false;
}

export async function registerUser() {
  const email = emailAtom.get();
  const password = passwordAtom.get();
  const confirmPassword = confirmPasswordAtom.get();
  const agreed = agreedAtom.get();
  const captchaToken = captchaTokenAtom.get();

  errorAtom.set("");
  successAtom.set("");

  if (!email || !password || !confirmPassword) {
    errorAtom.set("All fields are required.");
    return;
  }
  if (password !== confirmPassword) {
    errorAtom.set("Passwords do not match.");
    return;
  }
  if (!agreed) {
    errorAtom.set("You must agree to the legal terms.");
    return;
  }
  if (!captchaToken) {
    errorAtom.set("Please complete the hCaptcha challenge.");
    return;
  }
  loadingAtom.set(true);
  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
      },
    });
    if (signUpError) throw signUpError;
    successAtom.set("Registration successful! Please check your email to verify your account.");
  } catch (err: any) {
    errorAtom.set(err.message || "Registration failed.");
  } finally {
    loadingAtom.set(false);
  }
}
