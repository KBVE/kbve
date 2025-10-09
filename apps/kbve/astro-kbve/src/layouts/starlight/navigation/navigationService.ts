import { atom, computed } from 'nanostores';
import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  route: string;
  name: string;
  Icon: LucideIcon;
  tooltip: string;
  badge?: string;
  highlight?: boolean;
}

export interface NavigationState {
  isReady: boolean;
  isTransitioning: boolean;
  isMounted: boolean;
  skeletonVisible: boolean;
}

export const navigationState = atom<NavigationState>({
  isReady: false,
  isTransitioning: false,
  isMounted: false,
  skeletonVisible: true,
});

export const setNavigationReady = (ready: boolean) => {
  navigationState.set({
    ...navigationState.get(),
    isReady: ready,
  });
};

export const setNavigationMounted = (mounted: boolean) => {
  navigationState.set({
    ...navigationState.get(),
    isMounted: mounted,
  });
};

export const setSkeletonVisible = (visible: boolean) => {
  navigationState.set({
    ...navigationState.get(),
    skeletonVisible: visible,
  });
};

export const setTransitioning = (transitioning: boolean) => {
  navigationState.set({
    ...navigationState.get(),
    isTransitioning: transitioning,
  });
};

export const transitionDuration = 300;
export const itemStaggerDelay = 50;

export const smoothTransition = async (callback: () => void | Promise<void>) => {
  setTransitioning(true);

  await new Promise(resolve => requestAnimationFrame(resolve));

  await callback();

  await new Promise(resolve => setTimeout(resolve, transitionDuration));

  setTransitioning(false);
};

export const morphSkeletonToContent = () => {
  const skeleton = document.querySelector('#nav-skeleton') as HTMLElement;
  const reactNav = document.querySelector('#react-nav') as HTMLElement;

  if (!skeleton || !reactNav) return;

  skeleton.style.transition = `opacity ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  reactNav.style.transition = `opacity ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

  skeleton.style.opacity = '0';
  reactNav.style.opacity = '1';

  setTimeout(() => {
    skeleton.style.display = 'none';
    setSkeletonVisible(false);
  }, transitionDuration);
};

export const cn = (...classes: (string | boolean | undefined | null)[]) => {
  return classes.filter(Boolean).join(' ');
};

export const getNavigationItemClasses = (isActive?: boolean) => {
  return cn(
    'group relative flex items-center justify-center',
    'w-10 h-10 md:w-9 md:h-9 rounded-lg',
    'text-gray-600 dark:text-gray-400',
    'hover:text-gray-900 dark:hover:text-white',
    'hover:bg-gray-100/80 dark:hover:bg-gray-800/80',
    'backdrop-blur-sm',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2',
    'transition-all duration-200 ease-out',
    'active:scale-95 active:bg-gray-200/80 dark:active:bg-gray-700/80',
    isActive && 'bg-gray-100/60 dark:bg-gray-800/60 text-gray-900 dark:text-white'
  );
};

export const getIconClasses = (isLoading?: boolean) => {
  return cn(
    'w-5 h-5',
    'transition-all duration-200',
    'group-hover:scale-110 group-active:scale-95',
    !isLoading && 'animate-icon-in'
  );
};

export const getTooltipClasses = () => {
  return cn(
    'absolute left-full top-1/2 -translate-y-1/2 ml-3',
    'px-3 py-2 text-xs font-medium text-white',
    'bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm',
    'rounded-lg shadow-xl',
    'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
    'transition-all duration-200 ease-out',
    'pointer-events-none whitespace-nowrap',
    'z-[9999]'
  );
};