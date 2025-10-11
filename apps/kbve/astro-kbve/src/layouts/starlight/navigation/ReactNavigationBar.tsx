import React, { useEffect, useState, useMemo, useRef } from 'react';
import { userClientService } from '@kbve/astropad';
import {
  Home,
  BookOpen,
  Search,
  User,
  Settings,
  LogIn,
  LogOut,
  UserPlus,
  HelpCircle,
  Code,
  Terminal,
  Gamepad2,
  MessageCircle,
  Award,
  Bell,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useStore } from '@nanostores/react';
import {
  navigationState,
  setNavigationReady,
  setNavigationMounted,
  morphSkeletonToContent,
  smoothTransition,
  getNavigationItemClasses,
  getIconClasses,
  getTooltipClasses,
  cn,
  itemStaggerDelay,
  type NavigationItem,
} from './navigationService';

// Use global userClientService if available, else fallback to import
const userClientServiceRef =
  typeof window !== 'undefined' && (window as any).userClientService
    ? (window as any).userClientService
    : userClientService;

// Main navigation items for authenticated users
const MainNavItems: NavigationItem[] = [
  { route: '/profile', name: 'Profile', Icon: User, tooltip: 'Your profile' },
  { route: '/arcade', name: 'Arcade', Icon: Gamepad2, tooltip: 'Play games' },
  { route: '/messages', name: 'Messages', Icon: MessageCircle, tooltip: 'View messages' },
  { route: '/notifications', name: 'Notifications', Icon: Bell, tooltip: 'Notifications' },
  { route: '/settings', name: 'Settings', Icon: Settings, tooltip: 'Account settings' },
  { route: '/logout', name: 'Logout', Icon: LogOut, tooltip: 'Sign out' },
];

// Guest navigation items
const GuestNavItems: NavigationItem[] = [
  { route: '/login', name: 'Login', Icon: LogIn, tooltip: 'Sign in to your account', highlight: true },
  { route: '/register', name: 'Register', Icon: UserPlus, tooltip: 'Create new account' },
  { route: '/support', name: 'Support', Icon: HelpCircle, tooltip: 'Get help' },
  { route: '/docs/api', name: 'API', Icon: Code, tooltip: 'API Documentation' },
];

const NavigationShell: React.FC<{
  navigationItems: NavigationItem[];
  isMember: boolean;
  username: string | null;
  loading: boolean;
  avatarUrl?: string | null;
  currentPath?: string;
}> = ({ navigationItems, isMember, username, loading, avatarUrl, currentPath }) => {
  const navState = useStore(navigationState);

  return (
    <nav
      id="react-nav"
      className={cn(
        'absolute inset-0 flex items-center gap-2 ml-2 md:ml-4 pr-4',
        'transition-all duration-500',
        'min-w-[320px] md:min-w-[480px]',
        navState.isMounted && !loading ? 'opacity-100' : 'opacity-0'
      )}
      role="navigation"
      aria-label="Main navigation"
      style={{
        zIndex: 20,
        alignItems: 'center',
        willChange: 'opacity'
      }}
    >
      {navigationItems.map(({ route, name, Icon, tooltip, badge, highlight }, idx) => {
        const isActive = currentPath === route;
        return (
          <a
            key={route}
            href={route}
            className={cn(getNavigationItemClasses(isActive), 'relative')}
            style={{
              animationDelay: `${idx * itemStaggerDelay}ms`,
              willChange: 'transform, opacity',
              zIndex: 10
            }}
            aria-label={tooltip}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={getIconClasses(loading)}
              style={{
                animationDelay: `${idx * itemStaggerDelay + 100}ms`
              }}
              aria-hidden="true"
            />

            {/* Badge indicator with hover pulse */}
            {badge && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-lg transition-all duration-300 group-hover:animate-pulse z-20">
                {badge}
              </span>
            )}

            {/* Highlight glow effect with hover pulse */}
            {highlight && (
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-xl opacity-60 transition-all duration-300 group-hover:animate-pulse group-hover:opacity-100 -z-10" />
            )}

            {/* Enhanced Tooltip with higher z-index */}
            <div
              className={cn(
                'absolute left-full top-1/2 -translate-y-1/2 ml-3',
                'px-3 py-2 text-xs font-medium text-white',
                'bg-gray-900 dark:bg-gray-800 backdrop-blur-sm',
                'rounded-lg shadow-xl',
                'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
                'transition-all duration-200 ease-out',
                'pointer-events-none whitespace-nowrap'
              )}
              style={{
                zIndex: 999999
              }}
            >
              <span className="relative">{tooltip}</span>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2
                border-4 border-transparent border-r-gray-900 dark:border-r-gray-800" />
            </div>
          </a>
        );
      })}

      {/* Enhanced separator with gradient */}
      <div className="relative h-8 w-px mx-3 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-400 to-transparent dark:via-gray-600 opacity-50" />
      </div>

      {/* Enhanced member status section */}
      <div className="flex items-center gap-2 min-w-0 max-w-xs md:max-w-sm px-3 py-1.5 rounded-lg bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
        {/* Animated status indicator */}
        <div className="relative">
          <div className={cn(
            'w-2.5 h-2.5 rounded-full transition-all duration-500',
            isMember
              ? 'bg-gradient-to-r from-green-400 to-emerald-500'
              : 'bg-gradient-to-r from-gray-400 to-gray-500'
          )} />
          {isMember && (
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-50" />
          )}
        </div>

        {/* Avatar with hover effect */}
        {isMember && avatarUrl && (
          <div className="relative group">
            <img
              src={avatarUrl}
              alt={`${username}'s avatar`}
              className="w-7 h-7 rounded-full object-cover ring-2 ring-white/20 dark:ring-gray-700/50 shadow-md transition-transform duration-200 group-hover:scale-110"
              loading="lazy"
            />
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        )}

        {/* Username with better typography */}
        {isMember && username && (
          <span
            className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate block max-w-[6rem] md:max-w-[9rem] tracking-wide"
            title={`Logged in as ${username}`}
          >
            {username}
          </span>
        )}

        {!isMember && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 italic">
            Guest
          </span>
        )}
      </div>
    </nav>
  );
};

const ReactStarlightNav: React.FC = () => {
  const isReady = useStore(userClientServiceRef.userClientServiceReadyAtom);
  const userAtomValue = useStore(userClientServiceRef.userAtom);
  const username = useStore(userClientServiceRef.usernameAtom);
  const avatarUrl = userAtomValue?.user_metadata?.avatar_url || null;
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isReady && !mountedRef.current) {
      mountedRef.current = true;
      setNavigationMounted(true);

      // Smooth transition from skeleton to content
      smoothTransition(async () => {
        setLoading(false);
        setNavigationReady(true);

        // Morph skeleton to content after a brief delay
        setTimeout(() => {
          morphSkeletonToContent();
        }, 100);
      });
    }
  }, [isReady]);

  const isMember = !!userAtomValue;
  const navigationItems = useMemo(() => isMember ? MainNavItems : GuestNavItems, [isMember]);

  if (!isReady) {
    return null;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes nav-in {
            0% {
              opacity: 0;
              transform: translateY(10px) scale(0.95);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          .animate-nav-in {
            animation: nav-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }

          @keyframes icon-in {
            0% {
              opacity: 0;
              transform: rotate(-10deg) scale(0.8);
            }
            50% {
              transform: rotate(5deg) scale(1.05);
            }
            100% {
              opacity: 1;
              transform: rotate(0) scale(1);
            }
          }
          .animate-icon-in {
            animation: icon-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }

          /* Force tooltips to be on top */
          #react-nav a {
            position: relative;
          }

          #react-nav a:hover {
            z-index: 9999 !important;
          }
        `
      }} />
      <NavigationShell
        navigationItems={navigationItems}
        isMember={isMember}
        username={username}
        loading={loading}
        avatarUrl={avatarUrl}
        currentPath={currentPath}
      />
    </>
  );
}

export default ReactStarlightNav;