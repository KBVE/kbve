import { emailAtom, passwordAtom, confirmPasswordAtom, agreedAtom, captchaTokenAtom, errorAtom, successAtom, loadingAtom } from './registerstate';
// import { createClient } from '@supabase/supabase-js';
// const supabase = createClient('SUPABASE_URL', 'SUPABASE_ANON_KEY'); // Set your env vars

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
    // const { error: signUpError } = await supabase.auth.signUp({
    //   email,
    //   password,
    //   options: { captchaToken },
    // });
    // if (signUpError) throw signUpError;
    successAtom.set("Registration successful! Please check your email to verify your account.");
  } catch (err: any) {
    errorAtom.set(err.message || "Registration failed.");
  } finally {
    loadingAtom.set(false);
  }
}
