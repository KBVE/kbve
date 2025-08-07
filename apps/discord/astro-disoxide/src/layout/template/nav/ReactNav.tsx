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
  $isAuthenticated
} from './ServiceNav';
import { $userAtom, $userLoadingAtom } from '../userClient';
import { useNavigationEvents } from '../eventBus';
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
  const navEvents = useNavigationEvents();

  // Hide skeletons and show content
  const revealContent = useCallback(() => {
    
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

  // Navigation handlers - get fresh store values when triggered
  const handleShowOffCanvas = useCallback(async (type: 'navigation' | 'profile') => {
    // Get current store values directly instead of relying on React state
    const { $isAuthenticated } = await import('./ServiceNav');
    const { $userAtom, $userLoadingAtom } = await import('../userClient');
    
    const currentAuth = $isAuthenticated.get();
    const currentUser = $userAtom.get();
    const currentLoading = $userLoadingAtom.get();
    
    console.log('📤 Fresh store values:', {
      type,
      isAuthenticated: currentAuth,
      hasUser: !!currentUser,
      userEmail: currentUser?.email,
      loadingAuth: currentLoading
    });
    
    // Don't show profile if still loading auth
    if (type === 'profile' && currentLoading) {
      console.log('⏳ Still loading auth, not showing profile modal yet');
      return;
    }
    
    // Use fresh store values instead of potentially stale React state
    navEvents.showOffCanvas(type, { 
      user: currentUser, 
      isAuthenticated: currentAuth, 
      loadingAuth: currentLoading 
    });
  }, [navEvents]);

  const handleCloseOffCanvas = useCallback((reason?: 'user' | 'outside-click' | 'route-change') => {
    navEvents.closeOffCanvas(reason);
  }, [navEvents]);


  // Setup UI event listeners - much simpler now!
  const setupEventListeners = useCallback(() => {
    
    // Remove any existing listeners to prevent duplicates
    document.querySelectorAll('[data-content="user-avatar"], [data-content="mobile-user-avatar"], [data-nav="mobile-menu-toggle"], [data-nav="desktop-menu-toggle"]').forEach(el => {
      el.replaceWith(el.cloneNode(true));
    });

    // Profile triggers
    setTimeout(() => {
      const userAvatar = document.querySelector('[data-content="user-avatar"]');
      const mobileUserAvatar = document.querySelector('[data-content="mobile-user-avatar"]');

      if (userAvatar) {
        userAvatar.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleShowOffCanvas('profile');
        });
      }

      if (mobileUserAvatar) {
        mobileUserAvatar.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleShowOffCanvas('profile');
        });
      }
    }, 50);

    // Menu toggles
    const mobileMenuToggle = document.querySelector('[data-nav="mobile-menu-toggle"]');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleShowOffCanvas('navigation');
      });
    }

    const desktopMenuToggle = document.querySelector('[data-nav="desktop-menu-toggle"]');
    if (desktopMenuToggle) {
      desktopMenuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleShowOffCanvas('navigation');
      });
    }

    // Close buttons
    document.querySelectorAll('[data-modal-backdrop], [data-modal-close]').forEach(el => {
      const newEl = el.cloneNode(true);
      el.parentNode?.replaceChild(newEl, el);
      newEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCloseOffCanvas('user');
      });
    });

    // Global outside click handler
    const handleGlobalClick = (e: Event) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const target = e.target as HTMLElement;
      
      if (offcanvasModal && !offcanvasModal.classList.contains('hidden')) {
        const isClickInsideModal = offcanvasModal.contains(target);
        const isClickOnTrigger = target.closest('[data-content="user-avatar"], [data-content="mobile-user-avatar"], [data-nav="mobile-menu-toggle"], [data-nav="desktop-menu-toggle"]');
        
        if (!isClickInsideModal && !isClickOnTrigger) {
          handleCloseOffCanvas('outside-click');
        }
      }
    };

    // Global escape key handler
    const handleEscapeKey = (e: KeyboardEvent) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      
      if (e.key === 'Escape' && offcanvasModal && !offcanvasModal.classList.contains('hidden')) {
        handleCloseOffCanvas('user');
      }
    };

    // Touch gesture handling for swipe-to-close
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const panel = offcanvasModal?.querySelector('[data-modal-panel]') as HTMLElement;
      
      if (offcanvasModal && !offcanvasModal.classList.contains('hidden') && panel?.contains(e.target as Node)) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const panel = offcanvasModal?.querySelector('[data-modal-panel]') as HTMLElement;
      
      if (offcanvasModal && !offcanvasModal.classList.contains('hidden') && panel?.contains(e.target as Node)) {
        const touch = e.changedTouches[0];
        const touchEndX = touch.clientX;
        const touchEndY = touch.clientY;
        const touchEndTime = Date.now();
        
        // Calculate swipe distance and time
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const swipeTime = touchEndTime - touchStartTime;
        
        // Swipe right detection criteria
        const minSwipeDistance = 50; // pixels
        const maxSwipeTime = 500; // milliseconds
        const maxVerticalDeviation = 100; // pixels
        
        const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
        const isSwipeRight = deltaX > minSwipeDistance;
        const isQuickSwipe = swipeTime < maxSwipeTime;
        const isVerticallyConstrained = Math.abs(deltaY) < maxVerticalDeviation;
        
        if (isHorizontalSwipe && isSwipeRight && isQuickSwipe && isVerticallyConstrained) {
          handleCloseOffCanvas('user');
        }
      }
    };

    // Prevent default touch behavior on modal panel to enable custom swipe
    const handleTouchMove = (e: TouchEvent) => {
      const offcanvasModal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const panel = offcanvasModal?.querySelector('[data-modal-panel]') as HTMLElement;
      
      if (offcanvasModal && !offcanvasModal.classList.contains('hidden') && panel?.contains(e.target as Node)) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        
        // Only prevent default if it's a horizontal swipe to avoid interfering with vertical scrolling
        if (Math.abs(deltaX) > Math.abs(touch.clientY - touchStartY)) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleShowOffCanvas, handleCloseOffCanvas]);

  // Setup event listeners for the event bus
  useEffect(() => {
    // Listen to off-canvas events and handle the DOM manipulation
    const handleShowOffCanvas = navEvents.on('nav:show-offcanvas', ({ type, data }) => {
      
      const modal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const title = document.querySelector('[data-modal-title]') as HTMLElement;
      const content = document.querySelector('[data-modal-content]') as HTMLElement;
      const panel = modal?.querySelector('[data-modal-panel]') as HTMLElement;
      
      if (!modal || !title || !content || !panel) {
        return;
      }

      const isAlreadyOpen = !modal.classList.contains('hidden');
      
      // Set content based on type
      if (type === 'navigation') {
        title.textContent = 'Menu';
        content.innerHTML = `
          <div class="space-y-1">
            ${navItems.map(item => `
              <a href="${item.href}" class="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200">
                ${item.id === 'home' ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' : ''}
                ${item.id === 'servers' ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01M10 18h.01M6 10h.01M10 10h.01M6 6h.01M10 6h.01"/><path d="M13 6v12M19 10v8"/></svg>' : ''}
                ${item.id === 'features' ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : ''}
                ${item.id === 'pricing' ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/></svg>' : ''}
                ${item.id === 'docs' ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>' : ''}
                <span>${item.label}</span>
              </a>
            `).join('')}
          </div>
        `;
      } else if (type === 'profile') {
        title.textContent = 'Profile';
        const { user: currentUser, isAuthenticated: authStatus, loadingAuth } = data || {};
        
        // Debug the authentication state
        console.log('🔍 Profile modal debug:', {
          authStatus,
          hasUser: !!currentUser,
          loadingAuth,
          userData: currentUser ? { email: currentUser.email, metadata: currentUser.user_metadata } : null,
          dataReceived: data
        });
        
        // Show loading state if auth is still loading
        if (loadingAuth) {
          content.innerHTML = `
            <div class="text-center text-gray-400 py-8">
              <div class="w-16 h-16 mx-auto mb-4 animate-spin">
                <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
              </div>
              <p class="text-lg font-medium">Loading...</p>
              <p class="text-sm mt-1">Please wait</p>
            </div>
          `;
          return;
        }
        
        if (!authStatus || !currentUser) {
          content.innerHTML = `
            <div class="text-center text-gray-400 py-8">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <p class="text-lg font-medium">Not signed in</p>
              <p class="text-sm mt-1 mb-4">Please sign in to view your profile</p>
              <a href="/login" class="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors duration-200">
                Sign In
              </a>
            </div>
          `;
        } else {
          const avatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
          const initials = currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U';
          const displayName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';

          content.innerHTML = `
            <!-- User Info Header -->
            <div class="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
              <div class="relative">
                ${avatarUrl ? `
                  <img src="${avatarUrl}" alt="Profile" class="w-14 h-14 rounded-full ring-2 ring-purple-500/30" />
                ` : `
                  <div class="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                    ${initials}
                  </div>
                `}
                <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-gray-900 rounded-full"></div>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-white text-lg truncate">${displayName}</h3>
                <p class="text-sm text-gray-400 truncate">${currentUser.email}</p>
                <p class="text-xs text-green-400 flex items-center gap-1 mt-1">
                  <span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Online
                </p>
              </div>
            </div>
            
            <!-- Profile Navigation -->
            <div class="space-y-1">
              <a href="/profile/settings" class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200 group">
                <svg class="w-5 h-5 flex-shrink-0 text-gray-400 group-hover:text-purple-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span class="font-medium">Settings</span>
                <svg class="w-4 h-4 ml-auto text-gray-500 group-hover:text-gray-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
              
              <a href="/profile/balance" class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200 group">
                <svg class="w-5 h-5 flex-shrink-0 text-gray-400 group-hover:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="20" height="14" x="2" y="5" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <span class="font-medium">Balance</span>
                <svg class="w-4 h-4 ml-auto text-gray-500 group-hover:text-gray-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>

              <a href="/support" class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors duration-200 group">
                <svg class="w-5 h-5 flex-shrink-0 text-gray-400 group-hover:text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span class="font-medium">Support</span>
                <svg class="w-4 h-4 ml-auto text-gray-500 group-hover:text-gray-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
              
              <!-- Logout Section -->
              <div class="border-t border-gray-700 pt-3 mt-4">
                <button id="profile-signout" class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors duration-200 group">
                  <svg class="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span class="font-medium">Log out</span>
                </button>
              </div>
            </div>
          `;

          // Add event handlers
          setTimeout(() => {
            // Signout button - navigate to logout page
            const signoutBtn = document.getElementById('profile-signout');
            if (signoutBtn) {
              signoutBtn.addEventListener('click', () => {
                window.location.href = '/logout';
              });
            }

            // Profile navigation links - close modal when clicked
            const profileLinks = content.querySelectorAll('a[href^="/profile"], a[href="/support"]');
            profileLinks.forEach(link => {
              link.addEventListener('click', () => {
                handleCloseOffCanvas('user');
              });
            });
          }, 10);
        }
      }

      // Show modal if not already open
      if (!isAlreadyOpen) {
        modal.classList.remove('hidden');
        setTimeout(() => {
          panel.classList.remove('translate-x-full');
          panel.classList.add('translate-x-0');
        }, 10);
      }
    });

    const handleCloseOffCanvasEvent = navEvents.on('nav:close-offcanvas', () => {
      
      const modal = document.querySelector('[data-modal="offcanvas"]') as HTMLElement;
      const panel = modal?.querySelector('[data-modal-panel]') as HTMLElement;

      if (panel) {
        panel.classList.remove('translate-x-0');
        panel.classList.add('translate-x-full');
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 300);
      }
    });

    return () => {
      handleShowOffCanvas();
      handleCloseOffCanvasEvent();
    };
  }, [navEvents, handleCloseOffCanvas]);

  // Initialize on mount
  useEffect(() => {
    const initTimer = setTimeout(() => {
      revealContent();
      updateTooltips();
      
      // Setup event listeners with delay
      const listenerTimer = setTimeout(() => {
        setupEventListeners();
      }, 100);

      return () => clearTimeout(listenerTimer);
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

    handleRouteChange();
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Update content when auth state changes and emit auth event
  useEffect(() => {
    if (!loadingAuth) {
      revealContent();
      // Emit auth change event
      navEvents.authChanged(isAuthenticated, user);
    }
  }, [isAuthenticated, user, loadingAuth, revealContent, navEvents]);

  // This component primarily controls the DOM, no JSX render needed
  return null;
};

export default ReactNav;
