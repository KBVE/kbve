// Nanostores for reactive state management
import { atom, map, computed } from 'nanostores';

/**
 * Interface definitions for footer data structures
 */
export interface FooterLink {
  href: string;
  label: string;
  icon?: string;
  prefetch?: boolean;
  external?: boolean;
}

export interface FooterStatus {
  status: 'operational' | 'degraded' | 'outage' | 'maintenance';
  message: string;
  lastUpdated?: Date;
}

export interface SocialLink {
  platform: string;
  href: string;
  icon: string;
  label: string;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
  visible: boolean;
}

/**
 * FooterService - Singleton service for managing footer state
 * Provides centralized state management for all footer components
 */
export class FooterService {
  private static instance: FooterService | null = null;

  // Reactive stores for footer data - only Quick Links need React
  private quickLinksStore = atom<FooterLink[]>([]);
  private userAuthenticatedStore = atom<boolean>(false);
  private userDataStore = map<{ username?: string; email?: string; role?: string }>({});

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Only initialize if we're in a browser environment
    if (typeof window !== 'undefined') {
      this.initializeDefaults();
    }
  }

  /**
   * Get singleton instance of FooterService
   * @returns FooterService instance
   */
  public static getInstance(): FooterService {
    if (!FooterService.instance) {
      FooterService.instance = new FooterService();
    }
    return FooterService.instance;
  }

  /**
   * Initialize default values for stores
   */
  private initializeDefaults(): void {
    // Default quick links - only section that needs React for authentication-based changes
    this.quickLinksStore.set([
      { href: '/dashboard', label: 'Dashboard', prefetch: true },
      { href: '/projects', label: 'Projects', prefetch: true },
      { href: '/analytics', label: 'Analytics', prefetch: true },
      { href: '/settings', label: 'Settings', prefetch: true },
      { href: '/support', label: 'Support', prefetch: true }
    ]);
  }

  /**
   * Getter methods for store access
   */
  public getQuickLinks() {
    return this.quickLinksStore;
  }

  public getUserAuthenticated() {
    return this.userAuthenticatedStore;
  }

  public getUserData() {
    return this.userDataStore;
  }

  /**
   * Update methods for store modification
   */
  public updateQuickLinks(links: FooterLink[]): void {
    this.quickLinksStore.set(links);
  }

  public setUserAuthenticated(authenticated: boolean): void {
    this.userAuthenticatedStore.set(authenticated);
  }

  public updateUserData(data: { username?: string; email?: string; role?: string }): void {
    this.userDataStore.setKey('username', data.username);
    this.userDataStore.setKey('email', data.email);
    this.userDataStore.setKey('role', data.role);
  }

  /**
   * Utility methods
   */
  public async fetchDynamicLinks(): Promise<void> {
    // Placeholder for fetching dynamic Quick Links from API
    try {
      // const response = await fetch('/api/footer-quicklinks');
      // const data = await response.json();
      // this.updateQuickLinks(data.quickLinks);
    } catch (error) {
      console.error('Error fetching Quick Links:', error);
    }
  }

  /**
   * Update links based on user authentication status
   */
  public updateLinksForUser(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      // Update quick links for authenticated users
      this.updateQuickLinks([
        { href: '/dashboard', label: 'Dashboard', prefetch: true },
        { href: '/profile', label: 'Profile', prefetch: true },
        { href: '/projects', label: 'My Projects', prefetch: true },
        { href: '/settings', label: 'Settings', prefetch: true },
        { href: '/logout', label: 'Logout', prefetch: false }
      ]);
    } else {
      // Reset to default links for guests
      this.initializeDefaults();
    }
  }

  /**
   * Reset all stores to default values
   */
  public reset(): void {
    this.initializeDefaults();
    this.userAuthenticatedStore.set(false);
    this.userDataStore.set({});
  }
}

// Export singleton instance
export const footerService = FooterService.getInstance();

// Export default for convenience
export default footerService;