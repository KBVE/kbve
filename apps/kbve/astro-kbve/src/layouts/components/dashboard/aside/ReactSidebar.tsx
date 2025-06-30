import React, { useEffect, useState } from 'react';
import { clsx } from 'src/utils/tw';
import {
  LayoutDashboard,
  User,
  BarChart2,
  Folder,
  Settings,
} from 'lucide-react';

const navItems = [
  { route: '/dashboard', name: 'Dashboard', Icon: LayoutDashboard },
  { route: '/profile', name: 'Profile', Icon: User },
  { route: '/analytics', name: 'Analytics', Icon: BarChart2 },
  { route: '/projects', name: 'Projects', Icon: Folder },
  { route: '/settings', name: 'Settings', Icon: Settings },
];

const ReactSidebarNav = () => {
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleCrossFade = () => {
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
    };

    const initializeSidebar = async () => {
      try {
        setCurrentPath(window.location.pathname);
        
        // Simulate loading time for smooth UX
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setLoading(false);
        handleCrossFade();
      } catch (error) {
        console.error('Error initializing sidebar:', error);
        setLoading(false);
        handleCrossFade();
      }
    };

    initializeSidebar();
  }, []);

  if (loading) {
    return null; // Skeleton is handled by Astro
  }

  return (
    <nav 
      className={clsx(
        "space-y-2 transition-opacity duration-500 ease-out",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {navItems.map(({ route, name, Icon }) => {
        const isActive = currentPath.startsWith(route);
        return (
          <a
            key={route}
            href={route}
            className={clsx(
              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-300 group will-change-transform",
              isActive
                ? "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/20 hover:border-cyan-400/30"
                : "text-zinc-300 hover:bg-zinc-700 hover:text-white hover:scale-[1.02]"
            )}
          >
            <Icon className={clsx(
              "w-5 h-5 transition-colors duration-300",
              isActive 
                ? "text-cyan-400 group-hover:text-cyan-300" 
                : "text-zinc-400 group-hover:text-white"
            )} />
            <span className="transition-colors duration-300">
              {name}
            </span>
          </a>
        );
      })}
    </nav>
  );
};

export default ReactSidebarNav;