import React, { useEffect, useRef, useState } from 'react';
import { AnimationUtils } from './utils';
import type { AnimationConfig, NeoGlassAnimationElements, AnimationState } from './types';

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const animConfig = { ...defaultAnimationConfig, ...config };

  // Initialize elements and inject styles
  useEffect(() => {
    AnimationUtils.injectAnimationStyles();
    
    // Find all elements
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

    // Set up intersection observer
    if (elementsRef.current.panel) {
      const observer = AnimationUtils.createVisibilityObserver(setIsVisible);
      observer.observe(elementsRef.current.panel);
      
      cleanupFunctions.current.push(() => {
        observer.disconnect();
      });
    }

    return () => {
      cleanupFunctions.current.forEach(cleanup => cleanup());
      cleanupFunctions.current = [];
    };
  }, []);

  // Text rotation effect with improved animations
  useEffect(() => {
    if (!isVisible || animationState === 'paused') return;

    const rotateText = async () => {
      setAnimationState('animating');
      const nextIndex = (currentIndex + 1) % animConfig.textRotation.titles.length;
      
      await updateTextContent(nextIndex);
      setCurrentIndex(nextIndex);
      setAnimationState('idle');
    };

    intervalRef.current = setInterval(rotateText, animConfig.textRotation.interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isVisible, currentIndex, animationState, animConfig.textRotation.interval]);

  const updateTextContent = async (index: number): Promise<void> => {
    const { title, subtitle, description, badge } = elementsRef.current;
    const { titles, subtitles, descriptions, badges } = animConfig.textRotation;

    const promises: Promise<void>[] = [];

    if (title) {
      promises.push(AnimationUtils.animateTextTransition(title, titles[index]));
    }
    if (subtitle) {
      promises.push(AnimationUtils.animateTextTransition(subtitle, subtitles[index]));
    }
    if (description) {
      promises.push(AnimationUtils.animateTextTransition(description, descriptions[index]));
    }
    if (badge) {
      promises.push(AnimationUtils.animateTextTransition(badge, badges[index]));
    }

    await Promise.all(promises);
  };

  // Enhanced particle system
  useEffect(() => {
    if (!isVisible || !elementsRef.current.particles) return;

    const createParticle = () => {
      const particle = AnimationUtils.createParticle({
        size: Math.random() * 3 + 1,
        color: animConfig.particles.colors[Math.floor(Math.random() * animConfig.particles.colors.length)],
        opacity: Math.random() * 0.5 + 0.2,
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 0.5,
      });

      elementsRef.current.particles?.appendChild(particle);

      // Remove particle after animation
      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 6000);
    };

    // Create initial particles
    for (let i = 0; i < animConfig.particles.count; i++) {
      setTimeout(() => createParticle(), i * 500);
    }

    // Continue creating particles
    const particleInterval = setInterval(createParticle, 2000);
    cleanupFunctions.current.push(() => clearInterval(particleInterval));

    return () => {
      clearInterval(particleInterval);
    };
  }, [isVisible, animConfig.particles]);

  // Enhanced glow effect
  useEffect(() => {
    if (!isVisible || !elementsRef.current.glow) return;

    const glowElement = elementsRef.current.glow as HTMLElement;
    if (!glowElement) return;

    const animateGlow = () => {
      const intensity = animConfig.glowEffect.intensity;
      const color = animConfig.glowEffect.color;
      
      glowElement.style.setProperty('--glow-intensity', intensity.toString());
      glowElement.style.setProperty('--glow-color', color);
      
      // Pulse effect
      glowElement.classList.add('animate-pulse');
      
      setTimeout(() => {
        glowElement.classList.remove('animate-pulse');
      }, 2000);
    };

    animateGlow();
    const glowInterval = setInterval(animateGlow, 4000);
    cleanupFunctions.current.push(() => clearInterval(glowInterval));

    return () => {
      clearInterval(glowInterval);
    };
  }, [isVisible, animConfig.glowEffect]);

  // Parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (!elementsRef.current.panel) return;

      const rect = elementsRef.current.panel.getBoundingClientRect();
      const scrollProgress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
      
      // Apply parallax to background
      const bgElement = elementsRef.current.background as HTMLElement;
      if (bgElement) {
        const translateY = (scrollProgress - 0.5) * 20;
        bgElement.style.transform = `translateY(${translateY}px)`;
      }

      // Apply subtle rotation to decorative elements
      const decorElement = elementsRef.current.decoration as HTMLElement;
      if (decorElement) {
        const rotation = scrollProgress * 15;
        decorElement.style.transform = `rotate(${rotation}deg)`;
      }
    };

    const throttledScroll = AnimationUtils.throttle(handleScroll, 16);
    window.addEventListener('scroll', throttledScroll, { passive: true });
    cleanupFunctions.current.push(() => window.removeEventListener('scroll', throttledScroll));

    return () => window.removeEventListener('scroll', throttledScroll);
  }, []);

  // Magnetic hover effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
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
    };

    const handleMouseLeave = () => {
      const magneticElement = elementsRef.current.magnetic as HTMLElement;
      if (magneticElement) {
        magneticElement.style.transform = 'translate(0px, 0px)';
      }
    };

    const panel = elementsRef.current.panel;
    if (panel) {
      panel.addEventListener('mousemove', handleMouseMove);
      panel.addEventListener('mouseleave', handleMouseLeave);
      
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
    };
  }, []);

  return null; // This component only handles animations, doesn't render anything
};

export default NeoGlassPanelAnimations;
