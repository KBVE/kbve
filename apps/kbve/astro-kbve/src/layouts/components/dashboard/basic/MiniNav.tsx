import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom } from 'src/layouts/client/supabase/profile/userstate';
import { BarChart3, TrendingUp, Download, Share, User, Settings, LogOut, Bell } from 'lucide-react';

interface MiniNavProps {
  className?: string;
}

const MiniNav = ({ className }: MiniNavProps) => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const userBalance = useStore(userBalanceAtom);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.querySelector('[data-skeleton="avatar"]') as HTMLElement;
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out';
        skeleton.style.opacity = '0';
        skeleton.style.pointerEvents = 'none';
        skeleton.style.zIndex = '-1'; 
        skeleton.style.visibility = 'hidden';
      }
      
      // Fade in this component with a small delay for smooth transition
      setTimeout(() => setVisible(true), 100);
    };

    const initializeComponent = async () => {
      try {
        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 800));
        
        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error initializing MiniNav:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    initializeComponent();
  }, [user, userId, isGuest]);

  // Handle clicks outside dropdown to close it
  useEffect(() => {
    const handleMouseDownOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleTouchStartOutside = (event: TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleMouseDownOutside);
      document.addEventListener('touchstart', handleTouchStartOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleMouseDownOutside);
      document.removeEventListener('touchstart', handleTouchStartOutside);
    };
  }, [isDropdownOpen]);

  // Get user display name
  const displayName = useMemo(() => {
    if (isGuest) return 'Guest User';
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  }, [user, isGuest]);

  // Get user avatar URL
  const avatarUrl = useMemo(() => {
    if (isGuest || !user) return null;
    return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  }, [user, isGuest]);

  // Get user initials for fallback
  const userInitials = useMemo(() => {
    if (isGuest) return 'G';
    const name = user?.user_metadata?.full_name || user?.email || 'User';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }, [user, isGuest]);

  const navItems = [
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    { icon: TrendingUp, label: 'Performance', href: '/dashboard/performance' },
    { icon: Download, label: 'Downloads', href: '/dashboard/downloads' },
    { icon: Share, label: 'Share', href: '/dashboard/share' },
  ];

  const userMenuItems = [
    { icon: User, label: 'Profile', href: '/profile' },
    { icon: Settings, label: 'Settings', href: '/settings' },
    { icon: Bell, label: 'Notifications', href: '/notifications' },
    { icon: LogOut, label: 'Sign Out', href: '/logout', divider: true },
  ];

  if (loading) {
    return null; // Skeleton handled by Astro
  }

  return (
    <div 
      className={clsx(
        "flex items-center space-x-4 transition-opacity duration-500 z-50",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '0',
        zIndex: 10
      }}
    >
      {/* Navigation Items */}
      <nav className="hidden md:flex items-center space-x-3 mr-4">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="flex items-center px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all duration-200"
            title={item.label}
          >
            <item.icon className="w-4 h-4" />
            <span className="ml-2 hidden lg:block">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* User Profile Section */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-4 px-4 py-3 rounded-lg hover:bg-zinc-800 transition-all duration-200"
        >
          {/* User Avatar */}
          <div className="relative w-12 h-12">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full rounded-full object-cover border-2 border-zinc-700 hover:border-cyan-500 transition-colors duration-200"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm border-2 border-zinc-700 hover:border-cyan-500 transition-colors duration-200">
                {userInitials}
              </div>
            )}

            {!isGuest && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900"></span>
            )}
          </div>

          {/* User Info */}
          <div className="hidden sm:flex flex-col justify-center text-left leading-tight">
            <span className="text-sm font-semibold text-white truncate">{displayName}</span>
            <span className="text-xs text-zinc-400 truncate">
              {isGuest ? 'Guest Account' : user?.email || 'Member'}
            </span>
          </div>

          {/* Dropdown Arrow */}
          <svg
            className={clsx(
              "w-4 h-4 text-zinc-400 transition-transform duration-200",
              isDropdownOpen && "rotate-180"
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div 
            className="absolute top-full right-0 mt-2 w-48 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 py-1 z-30 transform -translate-x-1/4"
            style={{ zIndex: '100 !important' }}
          >
            {userMenuItems.map((item) => (
              <div key={item.label}>
                {item.divider && <hr className="border-zinc-700 my-1" />}
                <a
                  href={item.href}
                  className="flex items-center px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors duration-200"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <item.icon className="w-4 h-4 mr-3" />
                  {item.label}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniNav;
