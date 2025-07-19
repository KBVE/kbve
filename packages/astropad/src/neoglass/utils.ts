import type { ParticleConfig, GlowConfig } from './types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export class AnimationUtils {
  /**
   * Utility function for merging Tailwind CSS classes
   */
  static cn(...inputs: any[]): string {
    return twMerge(clsx(inputs));
  }

  /**
   * Returns Tailwind classes for neoglass text containers
   */
  static getTextContainerClasses(options?: {
    isAnimating?: boolean;
    enableShimmer?: boolean;
  }): string {
    const { isAnimating = false, enableShimmer = false } = options || {};
    
    return this.cn(
      // Layout stability
      'relative overflow-hidden',
      'break-words overflow-wrap-break-word',
      'text-ellipsis',
      // Performance optimizations
      'contain-style will-change-auto',
      // Animation states
      isAnimating && 'contain-layout contain-style contain-paint',
      // Shimmer effect
      enableShimmer && [
        'bg-gradient-to-r from-transparent via-[var(--sl-color-accent-high)]/40 to-transparent',
        'bg-[length:200%_100%] animate-[shimmer_2s_infinite]',
        'bg-clip-text [-webkit-background-clip:text]'
      ]
    );
  }

  /**
   * Returns Tailwind classes for fixed layout containers
   */
  static getFixedLayoutClasses(): string {
    return this.cn(
      'contain-layout',
      'min-h-[400px] flex flex-col'
    );
  }

  /**
   * Returns Tailwind classes for particle elements
   */
  static getParticleClasses(config: {
    size: number;
    opacity: number;
    color?: string;
  }): string {
    return this.cn(
      'absolute rounded-full pointer-events-none z-[1]',
      'blur-[0.5px] will-change-transform animate-[float-particle_var(--duration,3s)_infinite_ease-in-out]',
      `w-[${config.size}px] h-[${config.size}px]`,
      `opacity-[${config.opacity}]`
    );
  }

  /**
   * Returns Tailwind classes for glow effects
   */
  static getGlowClasses(options?: {
    isActive?: boolean;
    intensity?: 'low' | 'medium' | 'high';
    useAccentHigh?: boolean;
  }): string {
    const { isActive = false, intensity = 'medium', useAccentHigh = false } = options || {};
    
    const glowColor = useAccentHigh ? 'var(--sl-color-accent-high)' : 'var(--sl-color-accent-low)';
    
    const intensityMap = {
      low: `drop-shadow-[0_0_5px_${glowColor}]`,
      medium: `drop-shadow-[0_0_10px_${glowColor}]`,
      high: `drop-shadow-[0_0_20px_${glowColor}]`
    };

    return this.cn(
      'transition-all duration-300',
      intensityMap[intensity],
      isActive && 'animate-[glow-pulse_2s_ease-in-out]'
    );
  }

  /**
   * Returns Tailwind classes for smooth transitions
   */
  static getTransitionClasses(options?: {
    duration?: 'fast' | 'normal' | 'slow';
    easing?: 'linear' | 'ease' | 'ease-in-out' | 'spring';
  }): string {
    const { duration = 'normal', easing = 'ease-in-out' } = options || {};
    
    const durationMap = {
      fast: 'duration-200',
      normal: 'duration-300',
      slow: 'duration-500'
    };

    const easingMap = {
      linear: 'ease-linear',
      ease: 'ease-out',
      'ease-in-out': 'ease-in-out',
      spring: '[transition-timing-function:cubic-bezier(0.4,0,0.2,1)]'
    };

    return this.cn(
      'transition-all',
      durationMap[duration],
      easingMap[easing]
    );
  }

  /**
   * Returns classes for reduced motion support
   */
  static getReducedMotionClasses(): string {
    return this.cn(
      'motion-reduce:animate-none',
      'motion-reduce:transition-none',
      'motion-reduce:transform-none'
    );
  }

  /**
   * Applies Tailwind classes to elements dynamically
   */
  static applyClassesToElement(
    element: HTMLElement,
    classes: string,
    options?: { replace?: boolean }
  ): void {
    const { replace = false } = options || {};
    
    if (replace) {
      element.className = classes;
    } else {
      element.className = this.cn(element.className, classes);
    }
  }

  /**
   * Applies text container classes with animation state
   */
  static applyTextContainerClasses(
    element: HTMLElement,
    options?: {
      isAnimating?: boolean;
      enableShimmer?: boolean;
      additionalClasses?: string;
    }
  ): void {
    const classes = this.cn(
      this.getTextContainerClasses(options),
      this.getReducedMotionClasses(),
      options?.additionalClasses
    );
    
    this.applyClassesToElement(element, classes);
  }

  /**
   * Applies glow classes with state management
   */
  static applyGlowClasses(
    element: HTMLElement,
    options?: {
      isActive?: boolean;
      intensity?: 'low' | 'medium' | 'high';
      useAccentHigh?: boolean;
      additionalClasses?: string;
    }
  ): void {
    const classes = this.cn(
      this.getGlowClasses(options),
      this.getReducedMotionClasses(),
      options?.additionalClasses
    );
    
    this.applyClassesToElement(element, classes);
  }

  /**
   * Creates a smooth typewriter-style text transition
   */
  static animateTextTransition(
    element: Element,
    newText: string,
    duration: number = 800
  ): Promise<void> {
    return new Promise((resolve) => {
      const htmlElement = element as HTMLElement;
      const originalText = element.textContent || '';
      
      // Skip animation if text is the same
      if (originalText === newText) {
        resolve();
        return;
      }

      // Use a gentler fade + typewriter effect
      htmlElement.style.transition = 'opacity 300ms ease-out';
      
      // Phase 1: Gentle fade out
      htmlElement.style.opacity = '0.3';
      
      setTimeout(() => {
        // Phase 2: Typewriter effect
        this.typewriterEffect(htmlElement, newText, duration * 0.6).then(() => {
          // Phase 3: Fade back to full opacity
          htmlElement.style.opacity = '1';
          setTimeout(resolve, 100);
        });
      }, 150);
    });
  }

  /**
   * Creates a typewriter effect for text
   */
  private static typewriterEffect(
    element: HTMLElement,
    targetText: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const chars = targetText.split('');
      const interval = duration / chars.length;
      let currentIndex = 0;
      
      // Clear current text
      element.textContent = '';
      
      const typeChar = () => {
        if (currentIndex < chars.length) {
          element.textContent += chars[currentIndex];
          currentIndex++;
          setTimeout(typeChar, interval);
        } else {
          resolve();
        }
      };
      
      typeChar();
    });
  }

  /**
   * Alternative smooth morphing text transition
   */
  static animateTextMorph(
    element: Element,
    newText: string,
    duration: number = 600
  ): Promise<void> {
    return new Promise((resolve) => {
      const htmlElement = element as HTMLElement;
      const originalText = element.textContent || '';
      
      if (originalText === newText) {
        resolve();
        return;
      }

      // Apply smooth morph effect
      htmlElement.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      htmlElement.style.filter = 'blur(2px)';
      htmlElement.style.opacity = '0.7';
      htmlElement.style.transform = 'scale(0.98)';
      
      setTimeout(() => {
        element.textContent = newText;
        htmlElement.style.filter = 'blur(0px)';
        htmlElement.style.opacity = '1';
        htmlElement.style.transform = 'scale(1)';
        
        setTimeout(() => {
          htmlElement.style.transition = '';
          htmlElement.style.filter = '';
          htmlElement.style.transform = '';
          resolve();
        }, duration);
      }, duration / 3);
    });
  }

  /**
   * Creates a dynamic particle with custom configuration
   */
  static createParticle(config: ParticleConfig): HTMLElement {
    const particle = document.createElement('div');
    
    // Use Tailwind classes for most styling
    particle.className = this.getParticleClasses({
      size: config.size,
      opacity: config.opacity
    });
    
    // Set CSS custom properties and positioning
    particle.style.cssText = `
      background: ${config.color};
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      --duration: ${config.duration}s;
      animation-delay: ${config.delay}s;
    `;

    return particle;
  }

  /**
   * Applies magnetic hover effect to an element
   */
  static applyMagneticEffect(
    element: HTMLElement,
    strength: number = 0.1,
    maxDistance: number = 100
  ): () => void {
    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const distance = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
      );
      
      if (distance < maxDistance) {
        const offsetX = (e.clientX - centerX) * strength;
        const offsetY = (e.clientY - centerY) * strength;
        
        element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
    };

    const handleMouseLeave = () => {
      element.style.transform = 'translate(0px, 0px)';
    };

    document.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }

  /**
   * Creates a parallax scroll effect
   */
  static applyParallaxEffect(
    element: HTMLElement,
    intensity: number = 0.5
  ): () => void {
    const handleScroll = () => {
      const rect = element.getBoundingClientRect();
      const scrollProgress = Math.max(0, Math.min(1, 
        (window.innerHeight - rect.top) / window.innerHeight
      ));
      
      const translateY = (scrollProgress - 0.5) * intensity * 50;
      element.style.transform = `translateY(${translateY}px)`;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }

  /**
   * Applies dynamic glow effect
   */
  static applyGlowEffect(element: HTMLElement, config: GlowConfig): () => void {
    let animationId: number;
    let startTime: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      const progress = (elapsed % config.pulseDuration) / config.pulseDuration;
      const intensity = config.intensity * (0.5 + 0.5 * Math.sin(progress * Math.PI * 2));
      
      element.style.filter = `drop-shadow(0 0 ${intensity * 20}px ${config.color})`;
      
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }

  /**
   * Creates intersection observer for visibility-based animations
   */
  static createVisibilityObserver(
    callback: (isVisible: boolean) => void,
    threshold: number = 0.3
  ): IntersectionObserver {
    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          callback(entry.isIntersecting);
        });
      },
      { threshold }
    );
  }

  /**
   * Debounces a function call
   */
  static debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttles a function call
   */
  static throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Adds required CSS keyframes to the document (minimal CSS for keyframes only)
   */
  static injectAnimationStyles(): void {
    if (document.querySelector('#neoglass-animation-styles')) return;

    // Only include keyframes that can't be done with Tailwind
    const styles = `
      @keyframes float-particle {
        0%, 100% { 
          transform: translateY(0px) rotate(0deg); 
          opacity: var(--start-opacity, 0.3);
        }
        25% { 
          transform: translateY(-15px) rotate(90deg); 
          opacity: var(--mid-opacity, 0.6);
        }
        50% { 
          transform: translateY(-30px) rotate(180deg); 
          opacity: var(--max-opacity, 0.8);
        }
        75% { 
          transform: translateY(-15px) rotate(270deg); 
          opacity: var(--mid-opacity, 0.6);
        }
      }

      @keyframes glow-pulse {
        0%, 100% { filter: drop-shadow(0 0 5px var(--glow-color)); }
        50% { filter: drop-shadow(0 0 20px var(--glow-color)); }
      }

      @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'neoglass-animation-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}
