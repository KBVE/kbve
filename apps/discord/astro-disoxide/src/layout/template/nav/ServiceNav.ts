import { atom, computed } from 'nanostores';
import { userClientService } from '../userClient';

interface NavMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  requiresAuth?: boolean;
  hideWhenAuth?: boolean;
  children?: NavMenuItem[];
}

class NavService {
  private static instance: NavService;
  
  // State atoms
  public readonly isOpenAtom = atom<boolean>(false);
  public readonly isMobileAtom = atom<boolean>(false);
  public readonly activePathAtom = atom<string>("");
  public readonly dropdownOpenAtom = atom<boolean>(false);
  
  // Reference to UserClientService atoms
  public readonly userAtom = userClientService.userAtom;
  public readonly loadingAuthAtom = userClientService.userLoadingAtom;
  
  // Menu items configuration (excluding auth items which are handled separately)
  public readonly menuItemsAtom = atom<NavMenuItem[]>([
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
  public readonly isAuthenticatedAtom = computed(
    this.userAtom,
    (user) => !!user
  );

  public readonly visibleMenuItemsAtom = computed(
    [this.menuItemsAtom, this.isAuthenticatedAtom],
    (menuItems, isAuthenticated) => {
      return menuItems.filter(item => {
        if (item.requiresAuth && !isAuthenticated) return false;
        if (item.hideWhenAuth && isAuthenticated) return false;
        return true;
      });
    }
  );

  private constructor() {
    this.initializeClientState();
  }

  public static getInstance(): NavService {
    // If running in browser and global already exists, use it
    if (typeof window !== 'undefined') {
      if ((window as any).serviceNav) {
        NavService.instance = (window as any).serviceNav;
      } else if (!NavService.instance) {
        NavService.instance = new NavService();
        (window as any).serviceNav = NavService.instance;
      }
    } else {
      if (!NavService.instance) {
        NavService.instance = new NavService();
      }
    }
    return NavService.instance;
  }


  private initializeClientState(): void {
    if (typeof window !== 'undefined') {
      // Set initial path
      this.activePathAtom.set(window.location.pathname);

      // Check if mobile
      this.checkMobileView();
      window.addEventListener('resize', () => this.checkMobileView());

    }
  }

  private checkMobileView(): void {
    const isMobile = window.innerWidth < 768;
    this.isMobileAtom.set(isMobile);
    
    // Close mobile menu when switching to desktop
    if (!isMobile && this.isOpenAtom.get()) {
      this.isOpenAtom.set(false);
    }
  }


  public toggleMenu(): void {
    this.isOpenAtom.set(!this.isOpenAtom.get());
  }

  public closeMenu(): void {
    this.isOpenAtom.set(false);
  }

  public openMenu(): void {
    this.isOpenAtom.set(true);
  }

  public toggleDropdown(): void {
    this.dropdownOpenAtom.set(!this.dropdownOpenAtom.get());
  }

  public closeDropdown(): void {
    this.dropdownOpenAtom.set(false);
  }

  public setActivePath(path: string): void {
    this.activePathAtom.set(path);
  }

  public isActiveRoute(href: string): boolean {
    const currentPath = this.activePathAtom.get();
    if (href === '/') {
      return currentPath === href;
    }
    return currentPath.startsWith(href);
  }

  public async signOut(): Promise<void> {
    try {
      await userClientService.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('[NavService] Sign out failed:', error);
    }
  }

  public updateMenuItems(items: NavMenuItem[]): void {
    this.menuItemsAtom.set(items);
  }

  public addMenuItem(item: NavMenuItem): void {
    const currentItems = this.menuItemsAtom.get();
    this.menuItemsAtom.set([...currentItems, item]);
  }

  public removeMenuItem(id: string): void {
    const currentItems = this.menuItemsAtom.get();
    this.menuItemsAtom.set(currentItems.filter(item => item.id !== id));
  }

  public cleanup(): void {
    // NavService doesn't manage auth state anymore
    // UserClientService handles its own cleanup
  }
}

export const navService = NavService.getInstance();
export type { NavMenuItem };