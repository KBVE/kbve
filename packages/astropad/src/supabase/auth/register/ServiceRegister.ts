import { atom } from 'nanostores';
import { supabase } from '@kbve/astropad';

class RegisterService {
  private static instance: RegisterService;
  
  // State atoms
  public readonly emailAtom = atom<string>("");
  public readonly passwordAtom = atom<string>("");
  public readonly confirmPasswordAtom = atom<string>("");
  public readonly displayNameAtom = atom<string>("");
  public readonly agreedAtom = atom<boolean>(false);
  public readonly captchaTokenAtom = atom<string | null>(null);
  public readonly errorAtom = atom<string>("");
  public readonly successAtom = atom<string>("");
  public readonly loadingAtom = atom<boolean>(false);

  private constructor() {}

  public static getInstance(): RegisterService {
    if (!RegisterService.instance) {
      RegisterService.instance = new RegisterService();
    }
    return RegisterService.instance;
  }

  private clearMessages(): void {
    this.errorAtom.set("");
    this.successAtom.set("");
  }

  private sanitizeDisplayName(name: string): string {
    // Allow only letters, numbers, spaces, underscores, and hyphens
    return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  }

  public validatePassword(password: string) {
    return {
      length: password.length >= 8,
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/.test(password),
    };
  }

  public getPasswordValidationMessage = (password: string): string | true => {
    const v = this.validatePassword(password);
    if (!v.length) return 'Password must be at least 8 characters';
    if (!v.lower) return 'Password must include a lowercase letter';
    if (!v.upper) return 'Password must include an uppercase letter';
    if (!v.number) return 'Password must include a number';
    if (!v.special) return 'Password must include a special character';
    return true;
  }

  public async checkIfLoggedInAndRedirect(): Promise<boolean> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        this.successAtom.set("You are already logged in. Redirecting to your profile...");
        setTimeout(() => {
          window.location.href = `${window.location.origin}/profile/`;
        }, 1500);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking session:', error);
      return false;
    }
  }

  public async registerUser(): Promise<void> {
    const email = this.emailAtom.get();
    const password = this.passwordAtom.get();
    const confirmPassword = this.confirmPasswordAtom.get();
    const agreed = this.agreedAtom.get();
    const captchaToken = this.captchaTokenAtom.get();
    const displayName = this.sanitizeDisplayName(this.displayNameAtom.get());

    this.clearMessages();

    // Validation
    if (!email || !password || !confirmPassword) {
      this.errorAtom.set("All fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      this.errorAtom.set("Passwords do not match.");
      return;
    }

    if (!agreed) {
      this.errorAtom.set("You must agree to the legal terms.");
      return;
    }

    if (!captchaToken) {
      this.errorAtom.set("Please complete the hCaptcha challenge.");
      return;
    }

    if (!displayName) {
      this.errorAtom.set("Display name is required.");
      return;
    }

    // Additional password validation
    const passwordValidation = this.getPasswordValidationMessage(password);
    if (passwordValidation !== true) {
      this.errorAtom.set(passwordValidation);
      return;
    }

    this.loadingAtom.set(true);

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

      this.successAtom.set("Registration successful! Please check your email to verify your account.");
    } catch (err: any) {
      this.errorAtom.set(err.message || "Registration failed.");
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public clearState(): void {
    this.emailAtom.set("");
    this.passwordAtom.set("");
    this.confirmPasswordAtom.set("");
    this.displayNameAtom.set("");
    this.agreedAtom.set(false);
    this.captchaTokenAtom.set(null);
    this.clearMessages();
    this.loadingAtom.set(false);
  }

  public resetForm(): void {
    this.clearState();
  }
}

// Export singleton instance
export const registerService = RegisterService.getInstance();