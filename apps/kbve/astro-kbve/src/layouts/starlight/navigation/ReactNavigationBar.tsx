import React, { useEffect, useState, useMemo } from 'react';
import { userClientService } from '@kbve/astropad';
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

// Main navigation items (max 4 icons, no Home)
const MainNavItems = [
  { route: '/profile', name: 'Profile', Icon: User, tooltip: 'Your profile' },
  { route: '/arcade', name: 'Arcade', Icon: Gamepad2, tooltip: 'Play games' },
  { route: '/messages', name: 'Messages', Icon: MessageCircle, tooltip: 'View messages' },
  { route: '/settings', name: 'Settings', Icon: Settings, tooltip: 'Account settings' },
] as const;

// Guest navigation items (max 4 icons)
const GuestNavItems = [
  { route: '/login', name: 'Login', Icon: LogIn, tooltip: 'Sign in' },
  { route: '/register', name: 'Register', Icon: UserPlus, tooltip: 'Create account' },
  { route: '/support', name: 'Support', Icon: HelpCircle, tooltip: 'Support' },
  { route: '/docs/api', name: 'API', Icon: Code, tooltip: 'API Docs' },
] as const;

const ReactStarlightNav: React.FC = () => {
  const [userInfo, setUserInfo] = useState<{ username?: string; isMember: boolean }>({ isMember: false });
  const [loading, setLoading] = useState(true);
  // Skeleton fade-out state
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Use getCurrentUsername() to avoid unnecessary Supabase calls
        const username = userClientService.getCurrentUsername();
        // Use userAtom for membership status
        const isMember = !!userClientService.userAtom.get();
        setUserInfo({
          username: username ?? undefined,
          isMember,
        });
      } catch {
        setUserInfo({ isMember: false });
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  // Fade out skeleton and fade in nav bar
  useEffect(() => {
    if (!loading) {
      // Start fade out
      setTimeout(() => {
        setSkeletonVisible(false);
        // Remove skeleton from DOM after fade
        setTimeout(() => {
          const skeleton = document.getElementById('nav-skeleton');
          if (skeleton) {
            skeleton.style.opacity = '0';
            skeleton.style.pointerEvents = 'none';
            skeleton.style.zIndex = '-1';
            setTimeout(() => {
              skeleton.style.display = 'none';
            }, 400);
          }
        }, 400);
      }, 100);
    }
  }, [loading]);

  const navigationItems = userInfo.isMember ? MainNavItems : GuestNavItems;

  // Always render nav, but fade in when ready

  return (
    <nav
      className={`flex items-center space-x-1 ml-2 md:ml-4 transition-opacity duration-500 ${loading ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
      role="navigation"
      aria-label="Starlight navigation"
      style={{ zIndex: loading ? 0 : 20 }}
    >
      {navigationItems.map(({ route, name, Icon, tooltip }) => (
        <a
          key={route}
          href={route}
          className="group relative flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-md
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
            className="w-5 h-5 md:w-4 md:h-4 transition-transform duration-200 group-hover:scale-110" 
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
        className="group relative flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-md
          text-gray-600 dark:text-gray-400 
          hover:text-gray-900 dark:hover:text-gray-100
          hover:bg-gray-100 dark:hover:bg-gray-800
          focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2
          transition-all duration-200 ease-in-out
          active:scale-95"
        onClick={() => {
          const searchButton = document.querySelector('[data-open-modal]') as HTMLElement;
          if (searchButton) {
            searchButton.click();
          } else {
            const searchInput = document.querySelector('input[type=\"search\"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
          }
        }}
        title="Search documentation"
        aria-label="Search documentation"
      >
        <Search 
          className="w-5 h-5 md:w-4 md:h-4 transition-transform duration-200 group-hover:scale-110" 
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

      {/* Member status indicator and username */}
      <div className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          userInfo.isMember 
            ? 'bg-green-500 shadow-sm shadow-green-500/50' 
            : 'bg-gray-400 dark:bg-gray-600'
        }`} 
        title={userInfo.isMember ? `Logged in${userInfo.username ? ` as ${userInfo.username}` : ''}` : 'Guest user'}
        />
        {userInfo.isMember && userInfo.username && (
          <span className="ml-2 text-xs font-medium text-gray-700 dark:text-gray-300 hidden md:inline">{userInfo.username}</span>
        )}
      </div>
    </nav>
  );
};

export default ReactStarlightNav;