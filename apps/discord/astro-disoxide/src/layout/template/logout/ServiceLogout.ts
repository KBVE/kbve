import { atom } from 'nanostores';
import { supabase } from '../supabase';

class LogoutService {
  private static instance: LogoutService;
  
  // State atoms
  public readonly loadingAtom = atom<boolean>(false);
  public readonly errorAtom = atom<string>("");
  public readonly successAtom = atom<string>("");
  public readonly statusAtom = atom<'idle' | 'loading' | 'success' | 'error'>('idle');

  private constructor() {}

  public static getInstance(): LogoutService {
    if (!LogoutService.instance) {
      LogoutService.instance = new LogoutService();
    }
    return LogoutService.instance;
  }

  private clearMessages(): void {
    this.errorAtom.set("");
    this.successAtom.set("");
  }

  private setLocalStorageLogout(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('isMember', 'false');
    }
  }

  public async isUserLoggedIn(): Promise<boolean> {
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('Error checking session:', error);
        return false;
      }
      
      return !!sessionData?.session;
    } catch (err) {
      console.warn('Failed to check login status:', err);
      return false;
    }
  }

  public async logoutUser(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);
    this.statusAtom.set('loading');

    try {
      // First check if user is logged in
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        // User is not logged in
        this.statusAtom.set('error');
        this.errorAtom.set("You are not currently logged in. Redirecting to login...");
        
        setTimeout(() => {
          window.location.href = `${window.location.origin}/login`;
        }, 2000);
        return;
      }

      const { error } = await supabase.auth.signOut();
      
      // Clear local storage
      this.setLocalStorageLogout();
      
      if (error) {
        throw error;
      }
      
      this.statusAtom.set('success');
      this.successAtom.set("Logged out successfully! Redirecting...");
      
      // Redirect to login page after successful logout
      setTimeout(() => {
        window.location.href = `${window.location.origin}/login`;
      }, 1500);
      
    } catch (err: any) {
      this.statusAtom.set('error');
      this.errorAtom.set(err.message || "Logout failed.");
      
      // Even on error, redirect to home page after a delay
      setTimeout(() => {
        window.location.href = `${window.location.origin}/`;
      }, 3000);
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public async logoutAndRedirectHome(): Promise<void> {
    this.clearMessages();
    this.loadingAtom.set(true);
    this.statusAtom.set('loading');

    try {
      // First check if user is logged in
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        // User is not logged in
        this.statusAtom.set('error');
        this.errorAtom.set("You are not currently logged in. Redirecting to login...");
        
        setTimeout(() => {
          window.location.href = `${window.location.origin}/login`;
        }, 2000);
        return;
      }

      const { error } = await supabase.auth.signOut();
      
      // Clear local storage
      this.setLocalStorageLogout();
      
      if (error) {
        throw error;
      }
      
      this.statusAtom.set('success');
      this.successAtom.set("Logged out successfully! Redirecting to home...");
      
      // Redirect to home page after successful logout
      setTimeout(() => {
        window.location.href = `${window.location.origin}/`;
      }, 1500);
      
      setTimeout(() => {
        window.location.href = `${window.location.origin}/`;
      }, 1500);
      
    } catch (err: any) {
      this.statusAtom.set('error');
      this.errorAtom.set(err.message || "Logout failed.");
      
      // Redirect to home page after a delay even on error
      setTimeout(() => {
        window.location.href = `${window.location.origin}/`;
      }, 3000);
    } finally {
      this.loadingAtom.set(false);
    }
  }

  public clearState(): void {
    this.clearMessages();
    this.loadingAtom.set(false);
    this.statusAtom.set('idle');
  }

  public getStatusMessage(): string {
    const status = this.statusAtom.get();
    const error = this.errorAtom.get();
    const success = this.successAtom.get();
    
    switch (status) {
      case 'loading':
        return 'Logging you out…';
      case 'success':
        return success || 'Logged out! Redirecting…';
      case 'error':
        return error || 'Logout failed. Redirecting…';
      default:
        return '';
    }
  }
}

export const logoutService = LogoutService.getInstance();