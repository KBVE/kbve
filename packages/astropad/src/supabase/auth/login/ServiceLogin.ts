import { atom } from 'nanostores';
import { supabase } from '@kbve/astropad';

class LoginService {
  private static instance: LoginService;
  
  // State atoms
  public readonly emailAtom = atom<string>("");
  public readonly passwordAtom = atom<string>("");
  public readonly errorAtom = atom<string>("");
  public readonly successAtom = atom<string>("");
  public readonly loadingAtom = atom<boolean>(false);
  public readonly captchaTokenAtom = atom<string | null>(null);

  private constructor() {}

  public static getInstance(): LoginService {
    if (!LoginService.instance) {
      LoginService.instance = new LoginService();
    }
    return LoginService.instance;
  }

  public async loginUser() {
    const email = this.emailAtom.get();
    const password = this.passwordAtom.get();
    const captchaToken = this.captchaTokenAtom.get();
    this.errorAtom.set("");
    this.successAtom.set("");
    if (!email || !password) {
      this.errorAtom.set("Email and password are required.");
      return;
    }
    if (!captchaToken) {
      this.errorAtom.set("Please complete the hCaptcha challenge.");
      return;
    }
    this.loadingAtom.set(true);
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
      this.successAtom.set("Login successful! Redirecting...");
      setTimeout(() => {
        window.location.href = `${window.location.origin}/profile/`;
      }, 1500);
    } catch (err: any) {
      this.errorAtom.set(err.message || "Login failed.");
    } finally {
      this.loadingAtom.set(false);
    }
  }
}

// Export singleton instance
export const loginService = LoginService.getInstance();