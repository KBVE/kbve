import React from "react";
import { supabase } from '../supabaseClient';
import { clsx, twMerge } from '../tw';
import { useStore } from '@nanostores/react';
import { 
  isMenuOpen, 
  isAuthenticated, 
  userProfile, 
  navigationActions 
} from '../stores/navigationStore';

interface NavigationBarProps {
  className?: string;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({ className }) => {
  const menuOpen = useStore(isMenuOpen);
  const authenticated = useStore(isAuthenticated);
  const profile = useStore(userProfile);

  // Check authentication status on mount
  React.useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        navigationActions.setAuth(true, {
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username
        });
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        navigationActions.setAuth(true, {
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username
        });
      } else {
        navigationActions.logout();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigationActions.logout();
      navigationActions.closeMenu();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navItems = [
    { label: 'Home', href: '/', icon: '🏠' },
    { label: 'Memes', href: '/memes', icon: '😂' },
    { label: 'Create', href: '/create', icon: '✨' },
    { label: 'Trending', href: '/trending', icon: '🔥' },
    { label: 'About', href: '/about', icon: 'ℹ️' },
  ];

  return (
    <nav className={twMerge(
      'bg-zinc-900/80 backdrop-blur-md border-b border-zinc-700 sticky top-0 z-50',
      className
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <a href="/" className="flex items-center space-x-2">
              <span className="text-2xl">🎭</span>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
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
                  'flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium',
                  'text-neutral-300 hover:text-emerald-400 hover:bg-emerald-500/10',
                  'transition-colors duration-200'
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
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
                <button
                  onClick={handleSignOut}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium text-neutral-300 hover:text-red-400',
                    'border border-zinc-600 rounded-md hover:border-red-400',
                    'transition-colors duration-200'
                  )}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className={clsx(
                  'px-4 py-2 text-sm font-medium text-black',
                  'bg-gradient-to-r from-emerald-400 to-green-400 rounded-md',
                  'hover:from-emerald-500 hover:to-green-500',
                  'transition-all duration-200 transform hover:scale-105'
                )}
              >
                Sign In with GitHub
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={navigationActions.toggleMenu}
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
                  'flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium',
                  'text-neutral-300 hover:text-emerald-400 hover:bg-emerald-500/10',
                  'transition-colors duration-200'
                )}
                onClick={navigationActions.closeMenu}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
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
                  <button
                    onClick={handleSignOut}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-base font-medium',
                      'text-red-400 hover:bg-red-500/10 rounded-md',
                      'transition-colors duration-200'
                    )}
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSignIn}
                  className={clsx(
                    'w-full px-3 py-2 text-base font-medium text-black',
                    'bg-gradient-to-r from-emerald-400 to-green-400 rounded-md',
                    'hover:from-emerald-500 hover:to-green-500',
                    'transition-all duration-200'
                  )}
                >
                  Sign In with GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};