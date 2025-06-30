import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { clsx } from 'src/utils/tw';
import {
  LayoutDashboard,
  User,
  BarChart2,
  Folder,
  Settings,
} from 'lucide-react';

const navItems = [
  { route: '/', name: 'Home', Icon: LayoutDashboard },
  { route: '/profile', name: 'Profile', Icon: User },
  { route: '/analytics', name: 'Analytics', Icon: BarChart2 },
  { route: '/projects', name: 'Projects', Icon: Folder },
  { route: '/settings', name: 'Settings', Icon: Settings },
] as const;

const ReactSidebarNav = React.memo(() => {
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  // Memoize the crossfade handler to prevent recreating on every render
  const handleCrossFade = useCallback(() => {
    const skeleton = document.querySelector('[data-skeleton="aside"]') as HTMLElement;
    if (skeleton) {
      skeleton.style.transition = 'opacity 0.5s ease-out';
      skeleton.style.opacity = '0';
      skeleton.style.pointerEvents = 'none';
      skeleton.style.zIndex = '-1';
      skeleton.style.visibility = 'hidden';
    }
    
    // Fade in this component with a small delay for smooth transition
    setTimeout(() => setVisible(true), 100);
  }, []);

  // Memoize active state calculations to prevent unnecessary re-renders
  const activeStates = useMemo(() => {
    return navItems.reduce((acc, { route }) => {
      // Special handling for home route to prevent it being active on all pages
      if (route === '/') {
        acc[route] = currentPath === '/' || currentPath === '/home';
      } else {
        acc[route] = currentPath.startsWith(route);
      }
      return acc;
    }, {} as Record<string, boolean>);
  }, [currentPath]);

  useEffect(() => {
    const initializeSidebar = async () => {
      try {
        setCurrentPath(window.location.pathname);
        
        // Simulate loading time for smooth UX - shorter delay for sidebar
        await new Promise(resolve => setTimeout(resolve, 600));
        
        setLoading(false);
        handleCrossFade();
      } catch (error) {
        console.error('Error initializing sidebar:', error);
        setLoading(false);
        handleCrossFade();
      }
    };

    initializeSidebar();

    // Listen for navigation changes (for SPA-like behavior)
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    
    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleCrossFade]);

  if (loading) {
    return null; // Skeleton is handled by Astro
  }

  return (
    <nav 
      className={clsx(
        "space-y-2 transition-opacity duration-500 ease-out motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0"
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {navItems.map(({ route, name, Icon }, index) => {
        const isActive = activeStates[route];
        return (
          <a
            key={route}
            href={route}
            className={clsx(
              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-300 group will-change-transform motion-reduce:transition-none",
              "focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-zinc-800",
              isActive
                ? "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/20 hover:border-cyan-400/30"
                : "text-zinc-300 hover:bg-zinc-700 hover:text-white hover:scale-[1.02]"
            )}
            aria-current={isActive ? 'page' : undefined}
            style={{ 
              animationDelay: `${0.3 + (index * 0.1)}s`,
              ...(visible && { animation: 'fadeInUp 0.6s ease-out forwards' })
            }}
          >
            <Icon 
              className={clsx(
                "w-5 h-5 transition-colors duration-300 motion-reduce:transition-none",
                isActive 
                  ? "text-cyan-400 group-hover:text-cyan-300" 
                  : "text-zinc-400 group-hover:text-white"
              )}
              aria-hidden="true"
            />
            <span className="transition-colors duration-300 motion-reduce:transition-none">
              {name}
            </span>
          </a>
        );
      })}
    </nav>
  );
});

export default ReactSidebarNav;