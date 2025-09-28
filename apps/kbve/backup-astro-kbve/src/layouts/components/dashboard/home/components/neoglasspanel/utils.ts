import type { ParticleConfig, GlowConfig } from './types';

export class AnimationUtils {
  /**
   * Creates a smooth transition between text content without layout shift
   */
  static animateTextTransition(
    element: Element,
    newText: string,
    duration: number = 300
  ): Promise<void> {
    return new Promise((resolve) => {
      const parent = element.parentElement;
      if (!parent) {
        element.textContent = newText;
        resolve();
        return;
      }

      // Store original styles
      const originalPosition = (element as HTMLElement).style.position;
      const originalWidth = (element as HTMLElement).style.width;
      const originalHeight = (element as HTMLElement).style.height;
      
      // Get current dimensions before transition
      const rect = element.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      
      // Create a clone for the new text
      const clone = element.cloneNode(true) as HTMLElement;
      clone.textContent = newText;
      clone.style.position = 'absolute';
      clone.style.top = `${rect.top - parentRect.top}px`;
      clone.style.left = `${rect.left - parentRect.left}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.opacity = '0';
      clone.style.transform = 'scale(0.95)';
      clone.style.zIndex = '1';
      
      // Make parent relative if it isn't already
      const parentPosition = getComputedStyle(parent).position;
      if (parentPosition === 'static') {
        parent.style.position = 'relative';
      }
      
      parent.appendChild(clone);
      
      // Fade out original
      element.classList.add('transition-all', 'duration-300');
      (element as HTMLElement).style.opacity = '0';
      (element as HTMLElement).style.transform = 'scale(0.95)';
      
      setTimeout(() => {
        // Fade in clone
        clone.style.transition = 'all 300ms ease-out';
        clone.style.opacity = '1';
        clone.style.transform = 'scale(1)';
        
        setTimeout(() => {
          // Replace original content and restore
          element.textContent = newText;
          (element as HTMLElement).style.opacity = '1';
          (element as HTMLElement).style.transform = 'scale(1)';
          (element as HTMLElement).style.position = originalPosition;
          (element as HTMLElement).style.width = originalWidth;
          (element as HTMLElement).style.height = originalHeight;
          
          // Remove clone and cleanup
          parent.removeChild(clone);
          element.classList.remove('transition-all', 'duration-300');
          
          // Restore parent position if we changed it
          if (parentPosition === 'static') {
            parent.style.position = '';
          }
          
          resolve();
        }, duration);
      }, duration / 2);
    });
  }

  /**
   * Creates a dynamic particle with custom configuration
   */
  static createParticle(config: ParticleConfig): HTMLElement {
    const particle = document.createElement('div');
    
    particle.style.cssText = `
      position: absolute;
      width: ${config.size}px;
      height: ${config.size}px;
      background: ${config.color};
      border-radius: 50%;
      opacity: ${config.opacity};
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      pointer-events: none;
      z-index: 1;
      filter: blur(0.5px);
      animation: float-particle ${config.duration}s infinite ease-in-out ${config.delay}s;
      will-change: transform, opacity;
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
   * Adds required CSS keyframes to the document
   */
  static injectAnimationStyles(): void {
    if (document.querySelector('#neoglass-animation-styles')) return;

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

      @keyframes text-shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }

      .neoglass-text-shimmer {
        background: linear-gradient(
          90deg, 
          transparent, 
          rgba(34, 211, 238, 0.4), 
          transparent
        );
        background-size: 200% 100%;
        animation: text-shimmer 2s infinite;
        -webkit-background-clip: text;
        background-clip: text;
      }

      /* Layout stability classes */
      .neoglass-fixed-layout {
        contain: layout;
      }
      
      .neoglass-text-container {
        contain: layout style;
        will-change: auto;
      }
      
      [data-neoglass-title],
      [data-neoglass-subtitle],
      [data-neoglass-description],
      [data-neoglass-badge] {
        contain: style;
        word-break: break-word;
        overflow-wrap: break-word;
        text-overflow: ellipsis;
      }

      /* Prevent layout shifts during animations */
      .neoglass-animating {
        contain: layout style paint;
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
        .neoglass-text-container {
          contain: layout;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'neoglass-animation-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}
