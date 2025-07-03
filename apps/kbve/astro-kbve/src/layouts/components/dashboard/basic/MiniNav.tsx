import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom, syncUserBalance, syncSupabaseUser } from 'src/layouts/client/supabase/profile/userstate';
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
        syncSupabaseUser();
        if (userId) {
          syncUserBalance(userId);
        }
        
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
  }, [userId]);

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
    { icon: User, label: 'Profile', href: '/dashboard/profile' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
    { icon: Bell, label: 'Notifications', href: '/dashboard/notifications' },
    { icon: LogOut, label: 'Sign Out', href: '/auth/signout', divider: true },
  ];

  if (loading) {
    return null; // Skeleton handled by Astro
  }

  return (
    <div 
      className={clsx(
        "flex items-center space-x-4 absolute top-0 left-0 w-full transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {/* Navigation Items */}
      <nav className="hidden md:flex items-center space-x-2">
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
      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-3 p-2 rounded-lg hover:bg-zinc-800 transition-all duration-200"
        >
          {/* User Avatar */}
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover border-2 border-zinc-700 hover:border-cyan-500 transition-colors duration-200"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm border-2 border-zinc-700 hover:border-cyan-500 transition-colors duration-200">
                {userInitials}
              </div>
            )}
            {!isGuest && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900"></div>
            )}
          </div>

          {/* User Info */}
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-white">{displayName}</p>
            <p className="text-xs text-zinc-400">
              {isGuest ? 'Guest Account' : user?.email || 'Member'}
            </p>
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
          <div className="absolute right-0 mt-2 w-48 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 py-1 z-50">
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

      {/* Overlay to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
};

export default MiniNav;
