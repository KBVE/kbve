import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom } from 'src/layouts/client/supabase/profile/userstate';
import { BarChart3, TrendingUp, Download, Share, User, Settings, LogOut, Bell } from 'lucide-react';

interface AnimationState {
  [key: string]: boolean;
}

const ReactAbout = () => {
  const [animatedElements, setAnimatedElements] = useState<AnimationState>({});
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const animateKey = element.getAttribute('data-animate');
          const delay = parseInt(element.getAttribute('data-animate-delay') || '0');

          if (entry.isIntersecting && animateKey) {
            // Add delay for staggered animations
            setTimeout(() => {
              setAnimatedElements(prev => ({
                ...prev,
                [animateKey]: true
              }));

              // Apply animation classes
              element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
              element.classList.remove('opacity-0', 'translate-y-8', 'scale-95');
            }, delay);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '20px'
      }
    );

    // Find all elements with data-animate attributes
    const animatableElements = document.querySelectorAll('[data-animate]');
    
    // Initially hide elements and observe them
    animatableElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.classList.add('opacity-0', 'translate-y-8', 'scale-95');
      observerRef.current?.observe(htmlElement);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Optional: Add some dynamic content updates based on animation state
  useEffect(() => {
    if (animatedElements.title && animatedElements.description) {
      // You can add any additional logic here when certain elements are visible
      console.log('About section is now visible!');
    }
  }, [animatedElements]);

  return null; // This component only handles animations, no UI
};

export default ReactAbout;