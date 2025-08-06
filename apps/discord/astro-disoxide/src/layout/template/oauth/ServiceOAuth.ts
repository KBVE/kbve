import { atom } from 'nanostores';
import { supabase } from '../supabase';
import type { AuthChangeEvent } from '@supabase/supabase-js';

type OAuthProvider = 'github' | 'discord' | 'google' | 'twitter';

class OAuthService {
  private static instance: OAuthService;
  
  // State atoms
  public readonly loadingAtom = atom<boolean>(false);
  public readonly errorAtom = atom<string>("");
  public readonly successAtom = atom<string>("");
  public readonly providerAtom = atom<OAuthProvider | null>(null);

  private authStateSubscription: any = null;

  private constructor() {}

  public static getInstance(): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService();
    }
    return OAuthService.instance;
  }

  private getRedirectUrl(): string {
    return `${window.location.origin}/auth/callback`;
  }

  private clearMessages(): void {
    this.errorAtom.set("");
    this.successAtom.set("");
  }

  public async signInWithProvider(provider: OAuthProvider): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);
    this.providerAtom.set(provider);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: this.getRedirectUrl(),
        },
      });

      if (error) throw error;
      
      this.successAtom.set(`Redirecting to ${provider}...`);
      // The redirect happens automatically, no need to manually redirect
    } catch (err: any) {
      this.errorAtom.set(err.message || `${provider} sign-in failed.`);
      this.providerAtom.set(null);
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public async signInWithGithub(): Promise<void> {
    return this.signInWithProvider('github');
  }

  public async signInWithDiscord(): Promise<void> {
    return this.signInWithProvider('discord');
  }

  public async signInWithGoogle(): Promise<void> {
    return this.signInWithProvider('google');
  }

  public async signInWithTwitter(): Promise<void> {
    return this.signInWithProvider('twitter');
  }

  public async initializeOAuthCallback(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const url = new URL(window.location.href);
      const oauthError = url.searchParams.get('error');
      
      if (oauthError) {
        throw new Error(`OAuth Error: ${oauthError}`);
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const session = data.session;
      if (!session) throw new Error("No session found after OAuth redirect.");

      this.successAtom.set("OAuth login successful. Redirecting...");
      
      // You might want to prefetch profile data here too
      // setTimeout(() => {
      //   window.location.href = `${window.location.origin}/profile/`;
      // }, 1200);

    } catch (err: any) {
      this.errorAtom.set(err.message || "OAuth callback failed.");
    } finally {
      this.loadingAtom.set(false);
      this.providerAtom.set(null);
    }
  }

  public async handleAuthCallback(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (data.session) {
        this.successAtom.set("Authentication successful! Redirecting...");
        // setTimeout(() => {
        //   window.location.href = `${window.location.origin}/profile/`;
        // }, 1500);
      } else {
        throw new Error("No session found after OAuth callback");
      }
    } catch (err: any) {
      this.errorAtom.set(err.message || "Authentication failed.");
    } finally {
      this.loadingAtom.set(false);
      this.providerAtom.set(null);
    }
  }

  public async signOut(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);

    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      this.successAtom.set("Signed out successfully!");
      setTimeout(() => {
        window.location.href = `${window.location.origin}/`;
      }, 1000);
    } catch (err: any) {
      this.errorAtom.set(err.message || "Sign out failed.");
    } finally {
      this.loadingAtom.set(false);
      this.providerAtom.set(null);
    }
  }

  public clearState(): void {
    this.clearMessages();
    this.loadingAtom.set(false);
    this.providerAtom.set(null);
    this.unwatchAuthState();
  }

  public watchAuthState(): void {
    // Unsubscribe from previous subscription if exists
    this.unwatchAuthState();

    this.authStateSubscription = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      console.log(`[OAuthService] Auth state changed: ${event}`, session);

      switch (event) {
        case 'SIGNED_IN':
          this.successAtom.set("User signed in.");
          break;

        case 'SIGNED_OUT':
          this.successAtom.set("User signed out.");
          break;

        case 'TOKEN_REFRESHED':
          this.successAtom.set("Session refreshed.");
          break;

        case 'USER_UPDATED':
          this.successAtom.set("User updated.");
          break;

        case 'INITIAL_SESSION':
          if (session) {
            this.successAtom.set("Session initialized.");
          }
          break;

        default:
          this.successAtom.set(`Auth event: ${event}`);
          break;
      }

      if (!session) {
        this.errorAtom.set("No active session.");
      }
    });
  }

  public unwatchAuthState(): void {
    if (this.authStateSubscription) {
      this.authStateSubscription.subscription?.unsubscribe();
      this.authStateSubscription = null;
    }
  }
}

// Export singleton instance
export const oauthService = OAuthService.getInstance();
