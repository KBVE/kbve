/** @jsxImportSource react */

import { useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { 
  Home, 
  Server, 
  Star, 
  DollarSign, 
  BookOpen
} from 'lucide-react';
import { 
  $isAuthenticated,
  signOut
} from './ServiceNav';
import { $userAtom, $userLoadingAtom } from '../userClient';
interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'home', href: '/', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { id: 'servers', href: '/servers', label: 'Servers', icon: <Server className="w-5 h-5" /> },
  { id: 'features', href: '/features', label: 'Features', icon: <Star className="w-5 h-5" /> },
  { id: 'pricing', href: '/pricing', label: 'Pricing', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'docs', href: '/docs', label: 'Documentation', icon: <BookOpen className="w-5 h-5" /> },
];

const ReactNav = () => {
  const isAuthenticated = useStore($isAuthenticated);
  const user = useStore($userAtom);
  const loadingAuth = useStore($userLoadingAtom);

  // Hide skeletons and show content
  const revealContent = useCallback(() => {
    console.log('revealContent called', { isAuthenticated, user: !!user, loadingAuth });
    
    // Hide all skeletons
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });

    // Show navigation items
    navItems.forEach(item => {
      const contentEl = document.querySelector(`[data-content="${item.id}"]`) as HTMLElement;
      if (contentEl) {
        contentEl.classList.remove('hidden');
        contentEl.classList.add('flex');
        if (window.location.pathname === item.href) {
          contentEl.classList.add('text-purple-400', 'bg-purple-500/10');
        }
      }
    });

    // Show desktop menu button
    const desktopMenuBtn = document.querySelector('[data-content="menu"]') as HTMLElement;
    if (desktopMenuBtn) {
      desktopMenuBtn.classList.remove('hidden');
      desktopMenuBtn.classList.add('flex');
    }

    // Show mobile menu icon
    const mobileMenuIcon = document.querySelector('[data-content="mobile-menu-icon"]') as HTMLElement;
    if (mobileMenuIcon) {
      mobileMenuIcon.classList.remove('hidden');
    }

    // Show appropriate user section
    if (loadingAuth) return;

    if (isAuthenticated && user) {
      // Desktop user avatar
      const userAvatar = document.querySelector('[data-content="user-avatar"]') as HTMLElement;
      if (userAvatar) {
        userAvatar.classList.remove('hidden');
        userAvatar.classList.add('flex');
      }

      // Mobile user avatar
      const mobileUserAvatar = document.querySelector('[data-content="mobile-user-avatar"]') as HTMLElement;
      if (mobileUserAvatar) {
        mobileUserAvatar.classList.remove('hidden');
      }

      // Set user image or initials
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      const initials = user.email ? user.email.charAt(0).toUpperCase() : 'U';

      if (avatarUrl) {
        const userImage = document.querySelector('[data-user-image]') as HTMLImageElement;
        const mobileUserImage = document.querySelector('[data-mobile-user-image]') as HTMLImageElement;
        if (userImage) {
          userImage.src = avatarUrl;
          userImage.classList.remove('hidden');
        }
        if (mobileUserImage) {
          mobileUserImage.src = avatarUrl;
          mobileUserImage.classList.remove('hidden');
        }
      } else {
        const userInitials = document.querySelector('[data-user-initials]') as HTMLElement;
        const mobileUserInitials = document.querySelector('[data-mobile-user-initials]') as HTMLElement;
        if (userInitials) {
          userInitials.textContent = initials;
          userInitials.classList.remove('hidden');
        }
        if (mobileUserInitials) {
          mobileUserInitials.textContent = initials;
          mobileUserInitials.classList.remove('hidden');
        }
      }
    } else {
      // Show guest links on desktop
      const guestLinks = document.querySelector('[data-content="guest-links"]') as HTMLElement;
      if (guestLinks) {
        guestLinks.classList.remove('hidden');
        guestLinks.classList.add('flex');
      }

      // Show guest avatar on mobile
      const mobileGuestAvatar = document.querySelector('[data-content="mobile-guest-avatar"]') as HTMLElement;
      if (mobileGuestAvatar) {
        mobileGuestAvatar.classList.remove('hidden');
      }
    }
  }, [isAuthenticated, user, loadingAuth]);

  // Optional: Update tooltip text dynamically if needed
  const updateTooltips = useCallback(() => {
    // React can update tooltip text here if needed
    // For now, static text is fine since nav items are fixed
  }, []);

  // Show off-canvas menu with dynamic content
  const showOffCanvasMenu = useCallback((type: 'navigation' | 'profile') => {
    const modal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
    const title = document.querySelector('[data-modal-title]') as HTMLElement;
    const content = document.querySelector('[data-modal-content]') as HTMLElement;
    
    if (!modal || !title || !content) return;

    // Set title and content based on type
    if (type === 'navigation') {
      title.textContent = 'Menu';
      content.innerHTML = `
        <div class="space-y-1">
          <a href="/" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            <span>Home</span>
          </a>
          
          <a href="/servers" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="8" x="2" y="14" rx="2"/>
              <path d="M6 18h.01M10 18h.01M6 10h.01M10 10h.01M6 6h.01M10 6h.01"/>
              <path d="M13 6v12M19 10v8"/>
            </svg>
            <span>Servers</span>
          </a>
          
          <a href="/features" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>Features</span>
          </a>
          
          <a href="/pricing" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>
            </svg>
            <span>Pricing</span>
          </a>
          
          <a href="/docs" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
            </svg>
            <span>Documentation</span>
          </a>
        </div>
      `;
    } else if (type === 'profile') {
      title.textContent = 'Profile';
      
      if (!user) {
        content.innerHTML = `
          <div class="text-center text-gray-400">
            <p>User not authenticated</p>
            <p class="text-xs mt-2">Please sign in to view profile</p>
          </div>
        `;
      } else {
        const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
        const initials = user.email ? user.email.charAt(0).toUpperCase() : 'U';

        content.innerHTML = `
          <div class="flex items-center gap-3 mb-4 pb-4 border-b border-gray-700">
            <div class="relative">
              ${avatarUrl ? `
                <img src="${avatarUrl}" alt="Profile" class="w-12 h-12 rounded-full ring-2 ring-purple-500/20" />
              ` : `
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                  ${initials}
                </div>
              `}
              <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full"></div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-white truncate">${user.email}</h3>
              <p class="text-xs text-gray-400">Online</p>
            </div>
          </div>
          
          <div class="space-y-1">
            <button class="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-gray-800 rounded-md transition-colors duration-200">
              <svg class="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span class="text-sm">Profile Settings</span>
            </button>
            
            <button class="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-gray-800 rounded-md transition-colors duration-200">
              <svg class="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span class="text-sm">Account Settings</span>
            </button>

            <button class="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-gray-800 rounded-md transition-colors duration-200">
              <svg class="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 12l2 2 4-4"/>
                <path d="M21 12c-1.4 0-2.8-.35-4-.99l-1.17 1.17c-.42.42-.98.42-1.4 0L12.26 10c-.42-.42-.42-.98 0-1.4L14.43 6.43c-.64-1.2-.99-2.6-.99-4C15.09 2.9 16.9 3.52 18 5c1.48 1.1 2.1 2.91 2.1 4.43"/>
              </svg>
              <span class="text-sm">Privacy Settings</span>
            </button>
            
            <div class="border-t border-gray-700 pt-2 mt-2">
              <button id="profile-signout" class="w-full flex items-center gap-3 px-3 py-2 text-left text-red-400 hover:bg-red-900/20 rounded-md transition-colors duration-200">
                <svg class="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span class="text-sm">Sign Out</span>
              </button>
            </div>
          </div>
        `;

        // Add signout handler
        setTimeout(() => {
          const signoutBtn = document.getElementById('profile-signout');
          if (signoutBtn) {
            signoutBtn.addEventListener('click', () => {
              signOut();
              closeOffCanvasMenu();
            });
          }
        }, 10);
      }
    }

    // Show off-canvas panel
    modal.classList.remove('hidden');
    const modalPanel = modal.querySelector('[data-modal-panel]') as HTMLElement;
    if (modalPanel) {
      setTimeout(() => {
        modalPanel.classList.remove('translate-x-full');
        modalPanel.classList.add('translate-x-0');
      }, 10);
    }
  }, [user, isAuthenticated]);

  // Close off-canvas menu
  const closeOffCanvasMenu = useCallback(() => {
    const modal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
    const panel = modal?.querySelector('[data-modal-panel]') as HTMLElement;

    if (panel) {
      panel.classList.remove('translate-x-0');
      panel.classList.add('translate-x-full');
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 300);
    }
  }, []);

  // Close all modals
  const closeAllModals = useCallback(() => {
    document.querySelectorAll('[data-modal]').forEach(modal => {
      const panel = modal.querySelector('[data-modal-panel]') as HTMLElement;
      if (panel) {
        // Check modal type for appropriate animation
        const modalType = modal.getAttribute('data-modal');
        if (modalType === 'mobile-menu' || modalType === 'profile') {
          panel.classList.remove('translate-x-0');
          panel.classList.add('translate-x-full');
        }
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 300);
      }
    });

    // Reset menu icons
    const menuIcon = document.querySelector('[data-content="mobile-menu-icon"]') as HTMLElement;
    const closeIcon = document.querySelector('[data-content="mobile-close-icon"]') as HTMLElement;
    if (menuIcon) menuIcon.classList.remove('hidden');
    if (closeIcon) closeIcon.classList.add('hidden');
  }, []);

  // Setup modal controls
  const setupModals = useCallback(() => {
    // Profile modal triggers - need to set up after elements are revealed
    setTimeout(() => {
      const userAvatar = document.querySelector('[data-content="user-avatar"]');
      const mobileUserAvatar = document.querySelector('[data-content="mobile-user-avatar"]');

      console.log('Setting up profile modal triggers', { userAvatar: !!userAvatar, mobileUserAvatar: !!mobileUserAvatar });

      if (userAvatar) {
        userAvatar.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('User avatar clicked - showing profile modal');
          showOffCanvasMenu('profile');
        });
      }

      if (mobileUserAvatar) {
        mobileUserAvatar.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Mobile user avatar clicked - showing profile modal');
          showOffCanvasMenu('profile');
        });
      }
    }, 100); // Small delay to ensure elements are visible

    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector('[data-nav="mobile-menu-toggle"]');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => {
        showOffCanvasMenu('navigation');
      });
    }

    // Desktop menu toggle
    const desktopMenuToggle = document.querySelector('[data-nav="desktop-menu-toggle"]');
    if (desktopMenuToggle) {
      desktopMenuToggle.addEventListener('click', () => {
        showOffCanvasMenu('navigation');
      });
    }

    // Modal close buttons
    document.querySelectorAll('[data-modal-backdrop], [data-modal-close]').forEach(el => {
      el.addEventListener('click', () => {
        closeAllModals();
      });
    });

    // Close off-canvas menu when clicking outside
    document.addEventListener('click', (e) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const userAvatar = document.querySelector('[data-content="user-avatar"]');
      const mobileUserAvatar = document.querySelector('[data-content="mobile-user-avatar"]');
      
      if (offcanvasModal && !offcanvasModal.classList.contains('hidden')) {
        const target = e.target as HTMLElement;
        const isClickInsideModal = offcanvasModal.contains(target);
        const isClickOnAvatar = userAvatar?.contains(target) || mobileUserAvatar?.contains(target);
        
        if (!isClickInsideModal && !isClickOnAvatar) {
          closeOffCanvasMenu();
        }
      }
    });
  }, [showOffCanvasMenu, closeAllModals, closeOffCanvasMenu]);

  // Initialize on mount
  useEffect(() => {
    // Small delay to ensure smooth skeleton to content transition
    setTimeout(() => {
      revealContent();
      updateTooltips();
      setupModals();
    }, 500);

    // Update active state on navigation
    const handleRouteChange = () => {
      const currentPath = window.location.pathname;
      
      document.querySelectorAll('[data-content]').forEach(el => {
        if (el.hasAttribute('href')) {
          const href = el.getAttribute('href');
          if (href === currentPath) {
            el.classList.add('text-purple-400', 'bg-purple-500/10');
            el.classList.remove('text-gray-400');
          } else {
            el.classList.remove('text-purple-400', 'bg-purple-500/10');
            el.classList.add('text-gray-400');
          }
        }
      });
    };

    // Set initial active state
    handleRouteChange();

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, [revealContent, updateTooltips, setupModals]);

  // Update content when auth state changes
  useEffect(() => {
    if (!loadingAuth) {
      revealContent();
      // Re-setup modals after auth state changes
      setupModals();
    }
  }, [isAuthenticated, user, loadingAuth, revealContent, setupModals]);

  // This component primarily controls the DOM, no JSX render needed
  return null;
};

export default ReactNav;
