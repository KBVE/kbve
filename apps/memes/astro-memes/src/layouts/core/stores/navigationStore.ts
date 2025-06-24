import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';

// Navigation state store
export const isMenuOpen = atom<boolean>(false);

// User authentication state
export const isAuthenticated = atom<boolean>(false);
export const userProfile = atom<{ id: string; email: string; username?: string } | null>(null);

// Theme preference (dark theme only)
export const theme = persistentAtom<'dark'>('theme', 'dark');

// Actions for the navigation store
export const navigationActions = {
  toggleMenu: () => {
    isMenuOpen.set(!isMenuOpen.get());
  },
  closeMenu: () => {
    isMenuOpen.set(false);
  },
  openMenu: () => {
    isMenuOpen.set(true);
  },
  setAuth: (authenticated: boolean, profile?: { id: string; email: string; username?: string }) => {
    isAuthenticated.set(authenticated);
    userProfile.set(profile || null);
  },
  logout: () => {
    isAuthenticated.set(false);
    userProfile.set(null);
  }
};
