import { emailAtom, passwordAtom, confirmPasswordAtom, agreedAtom, captchaTokenAtom, errorAtom, successAtom, loadingAtom, displayNameAtom } from './registerstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { task } from 'nanostores';

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

export function sanitizeDisplayName(name: string): string {
  // Allow only letters, numbers, spaces, underscores, and hyphens
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
}

export async function registerUser() {
  const email = emailAtom.get();
  const password = passwordAtom.get();
  const confirmPassword = confirmPasswordAtom.get();
  const agreed = agreedAtom.get();
  const captchaToken = captchaTokenAtom.get();
  const displayName = sanitizeDisplayName(displayNameAtom.get());

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
  if (!displayName) {
    errorAtom.set("Display name is required.");
    return;
  }
  loadingAtom.set(true);
  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: { display_name: displayName },
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

export function validatePassword(password: string) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/.test(password),
  };
}

export function passwordValidationMessage(password: string): string | true {
  const v = validatePassword(password);
  if (!v.length) return 'Password must be at least 8 characters';
  if (!v.lower) return 'Password must include a lowercase letter';
  if (!v.upper) return 'Password must include an uppercase letter';
  if (!v.number) return 'Password must include a number';
  if (!v.special) return 'Password must include a special character';
  return true;
}
