/** @jsxImportSource react */

import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { navService } from './ServiceNav';

interface ReactNavProps {
  className?: string;
}

export const ReactNav: React.FC<ReactNavProps> = ({ 
  className = ''
}) => {
  // Subscribe to nav service state
  const isOpen = useStore(navService.isOpenAtom);
  const isMobile = useStore(navService.isMobileAtom);
  const isAuthenticated = useStore(navService.isAuthenticatedAtom);
  const user = useStore(navService.userAtom);
  const loadingAuth = useStore(navService.loadingAuthAtom);
  const visibleMenuItems = useStore(navService.visibleMenuItemsAtom);
  const dropdownOpen = useStore(navService.dropdownOpenAtom);

  // Initialize and show components
  useEffect(() => {
    navService.setActivePath(window.location.pathname);

    // Show desktop menu items after initialization
    setTimeout(() => {
      if (!isMobile) {
        visibleMenuItems.forEach(item => {
          const menuContainer = document.querySelector(`[data-nav="menu-${item.id}"]`) as HTMLElement;
          const skeleton = document.querySelector(`[data-skeleton="menu-${item.id}"]`) as HTMLElement;
          const content = document.querySelector(`[data-content="menu-${item.id}"]`) as HTMLElement;
          
          if (menuContainer && skeleton && content) {
            // Show the menu container
            menuContainer.classList.remove('hidden');
            menuContainer.classList.add('flex');
            
            // Hide skeleton and show content
            skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            content.classList.add('flex');
          }
        });
      }

      // Show mobile button
      if (isMobile) {
        const mobileContainer = document.querySelector('[data-nav="mobile-button"]') as HTMLElement;
        const mobileSkeleton = document.querySelector('[data-skeleton="mobile-button"]') as HTMLElement;
        const mobileContent = document.querySelector('[data-content="mobile-button"]') as HTMLElement;
        
        if (mobileContainer && mobileSkeleton && mobileContent) {
          mobileContainer.classList.remove('hidden');
          mobileContainer.classList.add('flex');
          mobileSkeleton.classList.add('hidden');
          mobileContent.classList.remove('hidden');
          mobileContent.classList.add('flex');
        }
      }
    }, 100);

    // Cleanup on unmount
    return () => {
      navService.cleanup();
    };
  }, [isMobile, visibleMenuItems]);

  // Handle authentication state changes and signal dot
  useEffect(() => {
    const signalDot = document.querySelector('[data-nav="signal"]') as HTMLElement;
    const authLinks = document.querySelector('[data-nav="auth-links"]') as HTMLElement;
    const userAvatarSection = document.querySelector('[data-nav="user-avatar-section"]') as HTMLElement;

    if (loadingAuth) {
      // Loading state - gray dot
      if (signalDot) {
        signalDot.className = 'w-3 h-3 rounded-full bg-gray-500 transition-colors duration-300';
        signalDot.title = 'Auth Status: Loading';
      }
      // Hide both auth options while loading
      if (authLinks) authLinks.classList.add('hidden');
      if (userAvatarSection) userAvatarSection.classList.add('hidden');
      return;
    }

    if (isAuthenticated && user) {
      // Authenticated state - green dot
      if (signalDot) {
        signalDot.className = 'w-3 h-3 rounded-full bg-green-500 transition-colors duration-300';
        signalDot.title = `Auth Status: Logged in as ${user.email}`;
      }

      // Show user avatar, hide auth links
      if (authLinks) authLinks.classList.add('hidden');
      if (userAvatarSection) {
        userAvatarSection.classList.remove('hidden');
        userAvatarSection.classList.add('flex');
      }

      // Update user info
      const userEmail = document.querySelector('[data-nav="user-email"]') as HTMLElement;
      if (userEmail) userEmail.textContent = user.email || '';

      // Update avatar
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      const initials = user.email ? user.email.charAt(0).toUpperCase() : 'U';
      
      const userAvatar = document.querySelector('[data-nav="user-avatar"]') as HTMLImageElement;
      const userInitials = document.querySelector('[data-nav="user-initials"]') as HTMLElement;

      if (avatarUrl) {
        // Show image avatar
        if (userAvatar) {
          userAvatar.src = avatarUrl;
          userAvatar.classList.remove('hidden');
        }
        if (userInitials) userInitials.classList.add('hidden');
      } else {
        // Show initials avatar
        if (userAvatar) userAvatar.classList.add('hidden');
        if (userInitials) {
          userInitials.textContent = initials;
          userInitials.classList.remove('hidden');
        }
      }
    } else {
      // Not authenticated - yellow dot
      if (signalDot) {
        signalDot.className = 'w-3 h-3 rounded-full bg-yellow-500 transition-colors duration-300';
        signalDot.title = 'Auth Status: Not logged in';
      }

      // Show auth links, hide user avatar
      if (userAvatarSection) userAvatarSection.classList.add('hidden');
      if (authLinks) {
        authLinks.classList.remove('hidden');
        authLinks.classList.add('flex');
      }
    }
  }, [isAuthenticated, user, loadingAuth]);

  // Handle dropdown state
  useEffect(() => {
    const dropdown = document.querySelector('[data-nav="user-dropdown"]') as HTMLElement;
    if (dropdown) {
      if (dropdownOpen) {
        dropdown.classList.remove('hidden');
      } else {
        dropdown.classList.add('hidden');
      }
    }
  }, [dropdownOpen]);

  // Handle mobile menu visibility
  useEffect(() => {
    const mobileMenu = document.querySelector('[data-nav="mobile-menu"]') as HTMLElement;
    const mobileMenuItems = document.querySelector('[data-nav="mobile-menu-items"]') as HTMLElement;

    if (isOpen && isMobile) {
      if (mobileMenu) mobileMenu.classList.remove('hidden');
      
      // Populate mobile menu items
      if (mobileMenuItems) {
        mobileMenuItems.innerHTML = '';
        visibleMenuItems.forEach(item => {
          const isActive = navService.isActiveRoute(item.href);
          const li = document.createElement('li');
          const a = document.createElement('a');
          
          a.href = item.href;
          a.className = `flex flex-col items-center justify-center p-2 text-xs transition-colors duration-200 ${
            isActive ? 'text-purple-400' : 'text-white hover:text-purple-400'
          }`;
          a.setAttribute('data-astro-prefetch', '');
          
          // Add icon (simplified for now)
          const iconDiv = document.createElement('div');
          iconDiv.className = 'w-6 h-6 mb-1';
          iconDiv.innerHTML = '●'; // Placeholder icon
          
          const textDiv = document.createElement('div');
          textDiv.textContent = item.label;
          
          a.appendChild(iconDiv);
          a.appendChild(textDiv);
          li.appendChild(a);
          mobileMenuItems.appendChild(li);
          
          // Handle click
          a.addEventListener('click', () => {
            navService.setActivePath(item.href);
            navService.closeMenu();
          });
        });
      }
    } else {
      if (mobileMenu) mobileMenu.classList.add('hidden');
    }
  }, [isOpen, isMobile, visibleMenuItems]);

  // Set up event listeners
  useEffect(() => {
    const mobileButton = document.querySelector('[data-content="mobile-button"]') as HTMLElement;
    const userButton = document.querySelector('[data-nav="user-button"]') as HTMLElement;
    const signOutButton = document.querySelector('[data-nav="signout-button"]') as HTMLElement;

    const handleMobileButtonClick = () => {
      navService.toggleMenu();
      
      // Update button icon
      const svg = mobileButton?.querySelector('svg');
      const span = mobileButton?.querySelector('span');
      if (svg && span) {
        if (isOpen) {
          svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>';
          span.textContent = 'Menu';
        } else {
          svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>';
          span.textContent = 'Close';
        }
      }
    };

    const handleUserButtonClick = (e: Event) => {
      e.preventDefault();
      navService.toggleDropdown();
    };

    const handleSignOut = async (e: Event) => {
      e.preventDefault();
      navService.closeDropdown();
      await navService.signOut();
    };

    // Handle click outside dropdown
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.querySelector('[data-nav="user-dropdown"]') as HTMLElement;
      const userButton = document.querySelector('[data-nav="user-button"]') as HTMLElement;
      
      if (dropdown && userButton && 
          !dropdown.contains(event.target as Node) && 
          !userButton.contains(event.target as Node)) {
        navService.closeDropdown();
      }
    };

    // Add event listeners
    if (mobileButton) mobileButton.addEventListener('click', handleMobileButtonClick);
    if (userButton) userButton.addEventListener('click', handleUserButtonClick);
    if (signOutButton) signOutButton.addEventListener('click', handleSignOut);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      // Remove event listeners
      if (mobileButton) mobileButton.removeEventListener('click', handleMobileButtonClick);
      if (userButton) userButton.removeEventListener('click', handleUserButtonClick);
      if (signOutButton) signOutButton.removeEventListener('click', handleSignOut);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // This component doesn't render any JSX - it only manipulates pre-rendered DOM
  return null;
};

export default ReactNav;