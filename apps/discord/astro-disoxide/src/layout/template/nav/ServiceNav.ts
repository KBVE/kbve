import { atom, computed } from 'nanostores';
import { $userAtom, $userLoadingAtom } from '../userClient';

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  requiresAuth?: boolean;
  hideWhenAuth?: boolean;
  children?: NavMenuItem[];
}

// Core navigation state atoms
export const $isNavOpen = atom<boolean>(false);
export const $isMobile = atom<boolean>(false);
export const $activePath = atom<string>("");
export const $dropdownOpen = atom<boolean>(false);

// Menu items configuration
export const $menuItems = atom<NavMenuItem[]>([
  {
    id: 'home',
    label: 'Home',
    href: '/',
  },
  {
    id: 'servers',
    label: 'Servers',
    href: '/servers',
  },
  {
    id: 'features',
    label: 'Features',
    href: '/features',
  },
  {
    id: 'pricing',
    label: 'Pricing',
    href: '/pricing',
  },
]);

// Computed values
export const $isAuthenticated = computed(
  $userAtom,
  (user) => !!user
);

export const $visibleMenuItems = computed(
  [$menuItems, $isAuthenticated],
  (menuItems, isAuthenticated) => {
    return menuItems.filter(item => {
      if (item.requiresAuth && !isAuthenticated) return false;
      if (item.hideWhenAuth && isAuthenticated) return false;
      return true;
    });
  }
);

// Navigation actions
export const toggleMenu = () => {
  $isNavOpen.set(!$isNavOpen.get());
};

export const closeMenu = () => {
  $isNavOpen.set(false);
};

export const openMenu = () => {
  $isNavOpen.set(true);
};

export const toggleDropdown = () => {
  $dropdownOpen.set(!$dropdownOpen.get());
};

export const closeDropdown = () => {
  $dropdownOpen.set(false);
};

export const setActivePath = (path: string) => {
  $activePath.set(path);
};

export const isActiveRoute = (href: string): boolean => {
  const currentPath = $activePath.get();
  if (href === '/') {
    return currentPath === href;
  }
  return currentPath.startsWith(href);
};

export const updateMenuItems = (items: NavMenuItem[]) => {
  $menuItems.set(items);
};

export const addMenuItem = (item: NavMenuItem) => {
  const currentItems = $menuItems.get();
  $menuItems.set([...currentItems, item]);
};

export const removeMenuItem = (id: string) => {
  const currentItems = $menuItems.get();
  $menuItems.set(currentItems.filter(item => item.id !== id));
};

export const signOut = async () => {
  const { userClientService } = await import('../userClient');
  try {
    await userClientService.signOut();
    window.location.href = '/';
  } catch (error) {
    console.error('[NavService] Sign out failed:', error);
  }
};

// Initialize client state
if (typeof window !== 'undefined') {
  // Set initial path
  $activePath.set(window.location.pathname);

  // Check if mobile and set up listener
  const checkMobileView = () => {
    const isMobile = window.innerWidth < 768;
    $isMobile.set(isMobile);
    
    // Close mobile menu when switching to desktop
    if (!isMobile && $isNavOpen.get()) {
      $isNavOpen.set(false);
    }
  };

  checkMobileView();
  window.addEventListener('resize', checkMobileView);
}