import React, { useState, useEffect } from "react";
import { clsx, twMerge } from 'src/layouts/core/tw';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { OAuthLogin } from '../auth/OAuthLogin';
import { LogoutButton } from '../auth/LogoutButton';
import { isAuthenticated, userProfile } from '../stores/userStore';

import { Home, Laugh, Sparkles, Flame, Info, Theater, Github, Loader2, LogOut, X } from 'lucide-react';

// Internal nano stores for this component only (UI state only, not auth state)
const navMenuOpen = atom<boolean>(false);
const authModalOpen = atom<boolean>(false);

// Internal navigation actions
const navActions = {
  toggleMenu: () => navMenuOpen.set(!navMenuOpen.get()),
  closeMenu: () => navMenuOpen.set(false),
  openMenu: () => navMenuOpen.set(true),
  openAuthModal: () => authModalOpen.set(true),
  closeAuthModal: () => authModalOpen.set(false),
};

interface NavigationBarProps {
  className?: string;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({ className }) => {
  const menuOpen = useStore(navMenuOpen);
  const authenticated = useStore(isAuthenticated);
  const profile = useStore(userProfile);
  const modalOpen = useStore(authModalOpen);

  // Close modal when user becomes authenticated
  useEffect(() => {
    if (authenticated && modalOpen) {
      navActions.closeAuthModal();
    }
  }, [authenticated, modalOpen]);

  // Auth Modal Component
  const AuthModal: React.FC = () => {
    if (!modalOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={navActions.closeAuthModal}
        />
        
        {/* Modal */}
        <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
          {/* Close button */}
          <button
            onClick={navActions.closeAuthModal}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X size={20} />
          </button>
          
          {/* Modal content */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Theater size={32} className="text-emerald-400 mr-2" />
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                Welcome to Meme.sh
              </span>
            </div>
            
            <p className="text-neutral-400 mb-8">
              Sign in to upload, like, and share your favorite memes with the community.
            </p>
            
            {/* Auth Component */}
            <OAuthLogin 
              redirectTo="/"
              className="w-full"
              showTitle={false}
            />
            
            <p className="text-xs text-neutral-500 mt-4">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Handle navigation mounting and skeleton removal
  useEffect(() => {
    // Signal that the navigation has fully mounted
    const skeleton = document.getElementById('nav-skeleton-loader');
    const content = document.getElementById('nav-content');
    
    if (skeleton && content) {
      // Small delay to ensure React has fully rendered
      setTimeout(() => {
        skeleton.style.opacity = '0';
        content.style.opacity = '1';
        
        // Remove skeleton from DOM after fade completes
        setTimeout(() => {
          skeleton.remove();
        }, 500);
      }, 50);
    }
  }, []);

  const navItems = [
    { label: 'Home', href: '/', icon: Home },
    { label: 'Memes', href: '/memes', icon: Laugh },
    { label: 'Create', href: '/create', icon: Sparkles },
    { label: 'Trending', href: '/trending', icon: Flame },
    { label: 'About', href: '/about', icon: Info },
  ];

  return (
    <>
      <nav className={twMerge(
        'bg-zinc-900/80 backdrop-blur-md border-b border-zinc-700 sticky top-0 z-50',
        className
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex-shrink-0">
              <a href="/" className="flex items-center space-x-2 group">
                <Theater size={24} className="text-emerald-400 transition-all duration-500 group-hover:scale-125 group-hover:rotate-[360deg] group-hover:text-green-300 drop-shadow-lg group-hover:drop-shadow-xl" />
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent group-hover:from-green-300 group-hover:to-emerald-300 transition-all duration-300">
                  Meme.sh
                </span>
              </a>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium group relative overflow-hidden',
                    'text-neutral-300 hover:text-emerald-400 hover:bg-emerald-500/10',
                    'transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20',
                    'before:absolute before:inset-0 before:bg-gradient-to-r before:from-emerald-500/0 before:via-emerald-500/10 before:to-emerald-500/0',
                    'before:translate-x-[-100%] before:transition-transform before:duration-500 hover:before:translate-x-[100%]'
                  )}
                  aria-label={item.label}
                >
                  <item.icon size={18} className="transition-all duration-300 group-hover:scale-125 group-hover:text-emerald-300 group-hover:rotate-12 group-hover:drop-shadow-lg" />
                  <span className="hidden lg:inline transition-all duration-300 group-hover:translate-x-1">{item.label}</span>
                </a>
              ))}
            </div>

            {/* Desktop Auth Section */}
            <div className="hidden md:flex items-center space-x-4">
              {authenticated ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-black text-sm font-medium">
                      {profile?.username?.[0]?.toUpperCase() || profile?.email[0]?.toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm text-neutral-300">
                      {profile?.username || profile?.email?.split('@')[0]}
                    </span>
                  </div>
                  <LogoutButton 
                    className={clsx(
                      'px-4 py-2 text-sm font-medium text-neutral-300 hover:text-red-400',
                      'border border-zinc-600 rounded-md hover:border-red-400',
                      'transition-colors duration-200'
                    )}
                    variant="button"
                    showIcon={false}
                    onLogout={() => {
                      navActions.closeMenu();
                    }}
                  >
                    Sign Out
                  </LogoutButton>
                </div>
              ) : (
                <button
                  onClick={navActions.openAuthModal}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium text-black',
                    'bg-gradient-to-r from-emerald-400 to-green-400 rounded-md',
                    'hover:from-emerald-500 hover:to-green-500',
                    'transition-all duration-200 transform hover:scale-105'
                  )}
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={navActions.toggleMenu}
                className={clsx(
                  'p-2 rounded-md text-neutral-300 hover:text-emerald-400 hover:bg-emerald-500/10',
                  'transition-colors duration-200'
                )}
                aria-label="Toggle menu"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {menuOpen ? (
                    <path d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {menuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-700">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium group relative overflow-hidden',
                    'text-neutral-300 hover:text-emerald-400 hover:bg-emerald-500/10',
                    'transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20',
                    'before:absolute before:inset-0 before:bg-gradient-to-r before:from-emerald-500/0 before:via-emerald-500/10 before:to-emerald-500/0',
                    'before:translate-x-[-100%] before:transition-transform before:duration-500 hover:before:translate-x-[100%]'
                  )}
                  onClick={navActions.closeMenu}
                  aria-label={item.label}
                >
                  <item.icon size={20} className="transition-all duration-300 group-hover:scale-125 group-hover:text-emerald-300 group-hover:rotate-12 group-hover:drop-shadow-lg" />
                  <span className="transition-all duration-300 group-hover:translate-x-1">{item.label}</span>
                </a>
              ))}
              
              {/* Mobile Auth Section */}
              <div className="pt-4 border-t border-zinc-700">
                {authenticated ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 px-3 py-2">
                      <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-black font-medium">
                        {profile?.username?.[0]?.toUpperCase() || profile?.email[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-300">
                          {profile?.username || 'User'}
                        </p>
                        <p className="text-xs text-neutral-500">{profile?.email}</p>
                      </div>
                    </div>
                    <LogoutButton 
                      className={clsx(
                        'w-full text-left px-3 py-2 text-base font-medium',
                        'text-red-400 hover:bg-red-500/10 rounded-md',
                        'transition-colors duration-200'
                      )}
                      variant="dropdown-item"
                      showIcon={false}
                      onLogout={() => {
                        navActions.closeMenu();
                      }}
                    >
                      Sign Out
                    </LogoutButton>
                  </div>
                ) : (
                  <div className="px-3">
                    <button
                      onClick={navActions.openAuthModal}
                      className={clsx(
                        'w-full px-3 py-2 text-base font-medium text-black',
                        'bg-gradient-to-r from-emerald-400 to-green-400 rounded-md',
                        'hover:from-emerald-500 hover:to-green-500',
                        'transition-all duration-200'
                      )}
                    >
                      Sign In
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
      
      {/* Auth Modal */}
      <AuthModal />
    </>
  );
};