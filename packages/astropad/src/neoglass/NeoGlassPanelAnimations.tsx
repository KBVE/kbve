import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimationUtils } from './utils';
import type { AnimationConfig, NeoGlassAnimationElements, AnimationState } from './types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};


const defaultAnimationConfig: AnimationConfig = {
  textRotation: {
    titles: [
      'Tech & Gaming Excellence with KBVE',
      'Code, Game, Create with KBVE',
      'Build Your Digital Empire',
      'Master the Art of Development'
    ],
    subtitles: [
      'Flow with serene access and deep-blue level features.',
      'Where innovation meets gaming passion.',
      'Crafting tomorrow\'s digital experiences.',
      'Elevate your skills to the next level.'
    ],
    descriptions: [
      "Whether you're diving into containerization, mastering Node.js, pushing for Diamond in League, or raiding in WoW, our community is here to support your journey. Share knowledge, form teams, and achieve your goals together.",
      "Join our vibrant community of developers and gamers. From React mastery to epic gaming sessions, we're building the future together.",
      "Discover cutting-edge tools, participate in collaborative projects, and connect with like-minded creators who share your passion for excellence.",
      "Transform your ideas into reality with our comprehensive resources, expert guidance, and supportive community ecosystem."
    ],
    badges: ['Memes', 'Tech', 'Gaming', 'Community'],
    interval: 5000
  },
  particles: {
    count: 6,
    colors: ['#22d3ee', '#06b6d4', '#0891b2', '#0e7490']
  },
  glowEffect: {
    intensity: 0.4,
    color: '#22d3ee'
  }
};

export const NeoGlassPanelAnimations: React.FC<{ config?: Partial<AnimationConfig> }> = ({ 
  config = {} 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  
  const elementsRef = useRef<NeoGlassAnimationElements>({
    panel: null,
    title: null,
    subtitle: null,
    description: null,
    badge: null,
    glow: null,
    particles: null,
    background: null,
    decoration: null,
    magnetic: null,
  });
  
  const cleanupFunctions = useRef<Array<() => void>>([]);
  const intervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particleTimeoutRefs = useRef<number[]>([]);

  // Memoize the merged configuration to prevent unnecessary re-renders
  const animConfig = useMemo(() => ({ 
    ...defaultAnimationConfig, 
    ...config 
  }), [config]);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    cleanupFunctions.current.push(() => mediaQuery.removeEventListener('change', handleChange));
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Initialize elements and inject styles
  useEffect(() => {
    AnimationUtils.injectAnimationStyles();
    
    // Find all elements with error handling
    try {
      elementsRef.current = {
        panel: document.querySelector('[data-neoglass-panel]'),
        title: document.querySelector('[data-neoglass-title]'),
        subtitle: document.querySelector('[data-neoglass-subtitle]'),
        description: document.querySelector('[data-neoglass-description]'),
        badge: document.querySelector('[data-neoglass-badge]'),
        glow: document.querySelector('[data-neoglass-glow]'),
        particles: document.querySelector('[data-neoglass-particles]'),
        background: document.querySelector('[data-neoglass-bg]'),
        decoration: document.querySelector('[data-neoglass-decor]'),
        magnetic: document.querySelector('[data-neoglass-magnetic]'),
      };

      // Set up intersection observer with better options
      if (elementsRef.current.panel) {
        const observer = AnimationUtils.createVisibilityObserver(setIsVisible, 0.1);
        observer.observe(elementsRef.current.panel);
        
        cleanupFunctions.current.push(() => observer.disconnect());
      }
    } catch (error) {
      console.warn('Failed to initialize NeoGlass elements:', error);
    }

    return () => {
      cleanupFunctions.current.forEach(cleanup => cleanup());
      cleanupFunctions.current = [];
      
      // Cleanup timeouts and animation frames
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      particleTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
      particleTimeoutRefs.current = [];
    };
  }, []);

  // Memoized text update function with staggered animations
  const updateTextContent = useCallback(async (index: number): Promise<void> => {
    const { title, subtitle, description, badge } = elementsRef.current;
    const { titles, subtitles, descriptions, badges } = animConfig.textRotation;

    // Skip animations if reduced motion is preferred
    if (isReducedMotion) {
      if (title) title.textContent = titles[index];
      if (subtitle) subtitle.textContent = subtitles[index];
      if (description) description.textContent = descriptions[index];
      if (badge) badge.textContent = badges[index];
      return;
    }

    try {
      // Stagger animations for a more natural feel
      const animations: Promise<void>[] = [];

      // Badge changes instantly (small text)
      if (badge) {
        badge.textContent = badges[index];
      }

      // Title uses smooth morph (most prominent)
      if (title) {
        animations.push(
          new Promise(resolve => {
            setTimeout(() => {
              AnimationUtils.animateTextMorph(title, titles[index], 500).then(resolve);
            }, 0);
          })
        );
      }

      // Subtitle uses typewriter effect (medium prominence)
      if (subtitle) {
        animations.push(
          new Promise(resolve => {
            setTimeout(() => {
              AnimationUtils.animateTextTransition(subtitle, subtitles[index], 600).then(resolve);
            }, 200);
          })
        );
      }

      // Description uses simple fade (large text block)
      if (description) {
        animations.push(
          new Promise(resolve => {
            setTimeout(() => {
              AnimationUtils.animateTextMorph(description, descriptions[index], 400).then(resolve);
            }, 400);
          })
        );
      }

      await Promise.all(animations);
    } catch (error) {
      // Fallback to simple text change if animations fail
      console.warn('Animation failed, using fallback:', error);
      if (title) title.textContent = titles[index];
      if (subtitle) subtitle.textContent = subtitles[index];
      if (description) description.textContent = descriptions[index];
      if (badge) badge.textContent = badges[index];
    }
  }, [animConfig.textRotation, isReducedMotion]);

  // Text rotation effect with improved animations
  useEffect(() => {
    if (!isVisible || animationState === 'paused' || isReducedMotion) return;

    const rotateText = async () => {
      if (animationState === 'animating') return; // Prevent overlapping animations
      
      setAnimationState('animating');
      const nextIndex = (currentIndex + 1) % animConfig.textRotation.titles.length;
      
      try {
        await updateTextContent(nextIndex);
        setCurrentIndex(nextIndex);
      } catch (error) {
        console.warn('Text rotation failed:', error);
      } finally {
        setAnimationState('idle');
      }
    };

    intervalRef.current = window.setInterval(rotateText, animConfig.textRotation.interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isVisible, currentIndex, animationState, animConfig.textRotation.interval, updateTextContent, isReducedMotion]);

  // Enhanced particle system with better performance
  useEffect(() => {
    if (!isVisible || !elementsRef.current.particles || isReducedMotion) return;

    const createParticle = () => {
      try {
        const particle = AnimationUtils.createParticle({
          size: Math.random() * 3 + 1,
          color: animConfig.particles.colors[Math.floor(Math.random() * animConfig.particles.colors.length)],
          opacity: Math.random() * 0.5 + 0.2,
          duration: Math.random() * 3 + 2,
          delay: Math.random() * 0.5,
        });

        elementsRef.current.particles?.appendChild(particle);

        // Use requestAnimationFrame for smoother cleanup
        const timeoutId = window.setTimeout(() => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
          // Remove from timeout refs
          const index = particleTimeoutRefs.current.indexOf(timeoutId);
          if (index > -1) {
            particleTimeoutRefs.current.splice(index, 1);
          }
        }, 6000);
        
        particleTimeoutRefs.current.push(timeoutId);
      } catch (error) {
        console.warn('Failed to create particle:', error);
      }
    };

    // Create initial particles with staggered timing
    const initialParticles = Math.min(animConfig.particles.count, 10); // Cap for performance
    for (let i = 0; i < initialParticles; i++) {
      const timeoutId = window.setTimeout(() => createParticle(), i * 500);
      particleTimeoutRefs.current.push(timeoutId);
    }

    // Continue creating particles at intervals
    const particleInterval = window.setInterval(createParticle, 2000);
    cleanupFunctions.current.push(() => clearInterval(particleInterval));

    return () => {
      clearInterval(particleInterval);
      // Clean up any pending timeouts
      particleTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
      particleTimeoutRefs.current = [];
    };
  }, [isVisible, animConfig.particles, isReducedMotion]);

  // Enhanced glow effect with performance optimization
  useEffect(() => {
    if (!isVisible || !elementsRef.current.glow || isReducedMotion) return;

    const glowElement = elementsRef.current.glow as HTMLElement;
    if (!glowElement) return;

    const animateGlow = () => {
      try {
        const intensity = animConfig.glowEffect.intensity;
        const color = animConfig.glowEffect.color;
        
        glowElement.style.setProperty('--glow-intensity', intensity.toString());
        glowElement.style.setProperty('--glow-color', color);
        
        // Use CSS animation instead of classes for better performance
        glowElement.style.animation = 'glow-pulse 2s ease-in-out';
        
        const timeoutId = window.setTimeout(() => {
          glowElement.style.animation = '';
        }, 2000);
        
        particleTimeoutRefs.current.push(timeoutId);
      } catch (error) {
        console.warn('Glow animation failed:', error);
      }
    };

    animateGlow();
    const glowInterval = window.setInterval(animateGlow, 4000);
    cleanupFunctions.current.push(() => clearInterval(glowInterval));

    return () => {
      clearInterval(glowInterval);
    };
  }, [isVisible, animConfig.glowEffect, isReducedMotion]);

  // Parallax scroll effect with requestAnimationFrame
  useEffect(() => {
    if (isReducedMotion) return;

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        animationFrameRef.current = requestAnimationFrame(() => {
          try {
            if (!elementsRef.current.panel) return;

            const rect = elementsRef.current.panel.getBoundingClientRect();
            const scrollProgress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
            
            // Apply parallax to background - DISABLED to fix clipping
            // const bgElement = elementsRef.current.background as HTMLElement;
            // if (bgElement) {
            //   const translateY = (scrollProgress - 0.5) * 20;
            //   bgElement.style.transform = `translateY(${translateY}px)`;
            // }

            // Apply subtle rotation to decorative elements
            const decorElement = elementsRef.current.decoration as HTMLElement;
            if (decorElement) {
              const rotation = scrollProgress * 15;
              decorElement.style.transform = `rotate(${rotation}deg)`;
            }
          } catch (error) {
            console.warn('Parallax scroll failed:', error);
          }
          
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    cleanupFunctions.current.push(() => window.removeEventListener('scroll', handleScroll));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReducedMotion]);

  // Magnetic hover effect with performance optimization
  useEffect(() => {
    if (isReducedMotion) return;

    let animationId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      animationId = requestAnimationFrame(() => {
        try {
          if (!elementsRef.current.panel) return;

          const rect = elementsRef.current.panel.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          
          const magneticStrength = 0.1;
          const offsetX = (x - centerX) * magneticStrength;
          const offsetY = (y - centerY) * magneticStrength;
          
          const magneticElement = elementsRef.current.magnetic as HTMLElement;
          if (magneticElement) {
            magneticElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
          }
        } catch (error) {
          console.warn('Magnetic effect failed:', error);
        }
      });
    };

    const handleMouseLeave = () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      requestAnimationFrame(() => {
        try {
          const magneticElement = elementsRef.current.magnetic as HTMLElement;
          if (magneticElement) {
            magneticElement.style.transform = 'translate(0px, 0px)';
          }
        } catch (error) {
          console.warn('Magnetic reset failed:', error);
        }
      });
    };

    const panel = elementsRef.current.panel;
    if (panel) {
      panel.addEventListener('mousemove', handleMouseMove, { passive: true });
      panel.addEventListener('mouseleave', handleMouseLeave, { passive: true });
      
      cleanupFunctions.current.push(() => {
        panel.removeEventListener('mousemove', handleMouseMove);
        panel.removeEventListener('mouseleave', handleMouseLeave);
      });
    }

    return () => {
      if (panel) {
        panel.removeEventListener('mousemove', handleMouseMove);
        panel.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isReducedMotion]);

  return null; // This component only handles animations, doesn't render anything
};

export default NeoGlassPanelAnimations;
