import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom } from 'src/layouts/client/supabase/profile/userstate';
import {
  Home,
  BookOpen,
  Search,
  User,
  Settings,
  LogIn,
  UserPlus,
  HelpCircle,
  Code,
  Terminal,
  Gamepad2,
  MessageCircle,
  Award,
} from 'lucide-react';

// Guest navigation items for non-authenticated users
const GuestNavItems = [
  { route: '/', name: 'Home', Icon: Home, tooltip: 'Go to homepage' },
  { route: '/login', name: 'Login', Icon: LogIn, tooltip: 'Sign in to your account' },
  { route: '/register', name: 'Register', Icon: UserPlus, tooltip: 'Create new account' },
  { route: '/support', name: 'Support', Icon: HelpCircle, tooltip: 'Get help and support' },
] as const;

// Member navigation items for authenticated users
const MemberNavItems = [
  { route: '/', name: 'Home', Icon: Home, tooltip: 'Go to homepage' },
  { route: '/profile', name: 'Profile', Icon: User, tooltip: 'View your profile' },
  { route: '/arcade', name: 'Arcade', Icon: Gamepad2, tooltip: 'Play games' },
  { route: '/igbc', name: 'IGBC', Icon: Award, tooltip: 'KBVE Game Development' },
  { route: '/messages', name: 'Messages', Icon: MessageCircle, tooltip: 'View messages' },
  { route: '/settings', name: 'Settings', Icon: Settings, tooltip: 'Account settings' },
] as const;

// Always available documentation navigation
const DocsNavItems = [
  { route: '/docs/api', name: 'API', Icon: Code, tooltip: 'API Documentation' },
  { route: '/docs/cli', name: 'CLI', Icon: Terminal, tooltip: 'Command Line Interface' },
] as const;

const ReactStarlightNav: React.FC = () => {
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Subscribe to user state changes
  const user = useStore(userAtom);

  // Determine which navigation items to show
  const navigationItems = useMemo(() => {
    const userItems = isMember ? MemberNavItems : GuestNavItems;
    return [...userItems, ...DocsNavItems];
  }, [isMember]);

  // Check authentication status
  useEffect(() => {
    const checkMemberStatus = () => {
      if (typeof window !== 'undefined') {
        const memberStatus = localStorage.getItem('isMember');
        setIsMember(memberStatus === 'true');
      }
      setLoading(false);
    };

    checkMemberStatus();
  }, [user]);

  if (loading) {
    return (
      <nav className="flex items-center space-x-1 ml-4">
        {/* Loading skeleton */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex items-center space-x-1 ml-4" role="navigation" aria-label="Starlight navigation">
      {navigationItems.map(({ route, name, Icon, tooltip }) => (
        <a
          key={route}
          href={route}
          className="group relative flex items-center justify-center w-8 h-8 rounded-md
            text-gray-600 dark:text-gray-400 
            hover:text-gray-900 dark:hover:text-gray-100
            hover:bg-gray-100 dark:hover:bg-gray-800
            focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2
            transition-all duration-200 ease-in-out
            active:scale-95"
          title={tooltip}
          aria-label={tooltip}
        >
          <Icon 
            className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" 
            aria-hidden="true"
          />
          
          {/* Tooltip */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3
            px-3 py-2 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700
            rounded-md shadow-lg opacity-0 group-hover:opacity-100
            transition-opacity duration-200 pointer-events-none
            whitespace-nowrap z-[9999]">
            {tooltip}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2
              border-4 border-transparent border-b-gray-900 dark:border-b-gray-700"></div>
          </div>
        </a>
      ))}
      
      {/* Search icon (always visible) */}
      <button
        className="group relative flex items-center justify-center w-8 h-8 rounded-md
          text-gray-600 dark:text-gray-400 
          hover:text-gray-900 dark:hover:text-gray-100
          hover:bg-gray-100 dark:hover:bg-gray-800
          focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2
          transition-all duration-200 ease-in-out
          active:scale-95"
        onClick={() => {
          // Trigger Starlight's search functionality
          const searchButton = document.querySelector('[data-open-modal]') as HTMLElement;
          if (searchButton) {
            searchButton.click();
          } else {
            // Fallback: focus on search input if available
            const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
          }
        }}
        title="Search documentation"
        aria-label="Search documentation"
      >
        <Search 
          className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" 
          aria-hidden="true"
        />
        
        {/* Tooltip */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3
          px-3 py-2 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700
          rounded-md shadow-lg opacity-0 group-hover:opacity-100
          transition-opacity duration-200 pointer-events-none
          whitespace-nowrap z-[9999]">
          Search documentation
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2
            border-4 border-transparent border-b-gray-900 dark:border-b-gray-700"></div>
        </div>
      </button>

      {/* Visual separator for member status */}
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
      
      {/* Member status indicator */}
      <div className="flex items-center justify-center w-8 h-8">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          isMember 
            ? 'bg-green-500 shadow-sm shadow-green-500/50' 
            : 'bg-gray-400 dark:bg-gray-600'
        }`} 
        title={isMember ? 'Logged in' : 'Guest user'}
        />
      </div>
    </nav>
  );
};

export default ReactStarlightNav;