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
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStore } from '@nanostores/react';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};


/**
 * Utility function to execute a callback on the next animation frame with an optional delay
 * @param callback - Function to execute
 * @param delay - Optional delay in milliseconds (default: 0)
 */
const nextFrame = (callback: () => void, delay: number = 0) => {
  requestAnimationFrame(() => {
    if (delay > 0) {
      setTimeout(callback, delay);
    } else {
      callback();
    }
  });
};

const hideSkeleton = () => {
  const skeleton = document.querySelector('#nav-skeleton') || document.querySelector('[data-skeleton="navigation"]');
  if (skeleton instanceof HTMLElement) {
    skeleton.style.transition = 'opacity 0.5s ease';
    skeleton.style.opacity = '0';
    skeleton.style.pointerEvents = 'none';
    skeleton.style.display = 'none';
  }
};


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
  const userAtomValue = useStore(userClientService.userAtom);
  const [loading, setLoading] = useState(true);
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [userAtomValue]);

  useEffect(() => {
    if (!loading) {
      nextFrame(() => hideSkeleton(), 50);
    }
  }, [loading]);

  const username = userClientService.getCurrentUsername();
  const isMember = !!userAtomValue;
  const navigationItems = useMemo(() => isMember ? MainNavItems : GuestNavItems, [isMember]);
  // ...existing code...

  // Shell component for navigation rendering
  const NavigationShell = React.useCallback(() => (
    <nav
      className={cn(
        'flex items-center space-x-1 ml-2 md:ml-4 transition-opacity duration-500 overflow-visible',
        !loading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      role="navigation"
      aria-label="Starlight navigation"
      style={{ zIndex: 20, transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)', alignItems: 'flex-end' }}
    >
      {navigationItems.map(({ route, name, Icon, tooltip }, idx) => (
        <a
          key={route}
          href={route}
          className={cn(
            'group relative overflow-visible flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-md',
            'text-gray-600 dark:text-gray-400',
            'hover:text-gray-900 dark:hover:text-gray-100',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
            'transition-all duration-200 ease-in-out active:scale-95',
            !loading ? 'animate-nav-in' : ''
          )}
          style={!loading ? { animationDelay: `${idx * 80}ms`, alignItems: 'flex-end' } : { alignItems: 'flex-end' }}
          title={tooltip}
          aria-label={tooltip}
        >
          <Icon 
            className={cn(
              'w-5 h-5 md:w-4 md:h-4 transition-transform duration-200 group-hover:scale-110',
              !loading ? 'animate-icon-in' : ''
            )}
            style={!loading ? { animationDelay: `${idx * 80 + 100}ms`, willChange: 'transform' } : { willChange: 'transform' }}
            aria-hidden="true"
          />
          {/* Tooltip */}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5
              px-3 py-2 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700
              rounded-md shadow-lg opacity-0 group-hover:opacity-100
              transition-opacity duration-200 pointer-events-none
              whitespace-nowrap"
            style={{ willChange: 'transform', zIndex: 99999 }}
          >
            {tooltip}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2
              border-4 border-transparent border-b-gray-900 dark:border-b-gray-700"></div>
          </div>
        </a>
      ))}

      {/* Visual separator for member status */}
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />

      {/* Member status indicator and username */}
      <div className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          isMember 
            ? 'bg-green-500 shadow-sm shadow-green-500/50' 
            : 'bg-gray-400 dark:bg-gray-600'
        }`} 
        title={isMember ? `Logged in${username ? ` as ${username}` : ''}` : 'Guest user'}
        />
        {isMember && username && (
          <span className="ml-2 text-xs font-medium text-gray-700 dark:text-gray-300 hidden md:inline">{username}</span>
        )}
      </div>
    </nav>
  ), [navigationItems, loading, isMember, username]);

  return <NavigationShell />;
};

export default ReactStarlightNav;