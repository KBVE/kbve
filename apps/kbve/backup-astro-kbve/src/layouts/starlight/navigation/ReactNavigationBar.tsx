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

// Use global userClientService if available, else fallback to import
const userClientServiceRef =
  typeof window !== 'undefined' && (window as any).userClientService
    ? (window as any).userClientService
    : userClientService;

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


const NavigationShell: React.FC<{
  navigationItems: typeof MainNavItems | typeof GuestNavItems;
  isMember: boolean;
  username: string | null;
  loading: boolean;
  avatarUrl?: string | null;
}> = ({ navigationItems, isMember, username, loading, avatarUrl }) => (
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
        {/* Tooltip - now appears to the right of the icon */}
        <div
          className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2
            px-3 py-2 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700
            rounded-md shadow-lg opacity-0 group-hover:opacity-100
            transition-opacity duration-200 pointer-events-none
            whitespace-nowrap"
          style={{ willChange: 'transform', zIndex: 99999 }}
        >
          {tooltip}
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -ml-2
            border-4 border-transparent border-r-gray-900 dark:border-r-gray-700"></div>
        </div>
      </a>
    ))}

    {/* Visual separator for member status */}
    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />

    {/* Member status indicator, avatar, and username */}
    <div className="flex items-center min-w-0 max-w-xs md:max-w-sm">
      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
        isMember 
          ? 'bg-green-500 shadow-sm shadow-green-500/50' 
          : 'bg-gray-400 dark:bg-gray-600'
      }`} 
      title={isMember ? `Logged in${username ? ` as ${username}` : ''}` : 'Guest user'}
      />
      {isMember && avatarUrl && (
        <img
          src={avatarUrl}
          alt="avatar"
          className="ml-2 w-6 h-6 rounded-full object-cover border border-gray-300 dark:border-gray-700 shadow"
          style={{ minWidth: 24, minHeight: 24 }}
        />
      )}
      {isMember && username && (
        <span
          className="ml-2 text-xs font-medium text-gray-700 dark:text-gray-300 truncate block max-w-[7rem] md:max-w-[10rem]"
          style={{ lineHeight: '1.2', minWidth: 0 }}
          title={username}
        >
          {username}
        </span>
      )}
    </div>
  </nav>
);

const ReactStarlightNav: React.FC = () => {
  const isReady = useStore(userClientServiceRef.userClientServiceReadyAtom);
  const userAtomValue = useStore(userClientServiceRef.userAtom);
  const username = useStore(userClientServiceRef.usernameAtom);
  const avatarUrl = userAtomValue?.user_metadata?.avatar_url || null;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isReady) {
      setLoading(false);
    }
  }, [isReady]);

  useEffect(() => {
    if (isReady && !loading) {
      nextFrame(() => hideSkeleton(), 50);
    }
  }, [isReady, loading]);

  const isMember = !!userAtomValue;
  const navigationItems = useMemo(() => isMember ? MainNavItems : GuestNavItems, [isMember]);

  if (!isReady) {
    return null;
  }

  return (
    <NavigationShell
      navigationItems={navigationItems}
      isMember={isMember}
      username={username}
      loading={loading}
      avatarUrl={avatarUrl}
    />
  );
}

export default ReactStarlightNav;