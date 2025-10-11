/** @jsxImportSource react */

import React, { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { type HolyCardProps, type HolyCardIconAction, holyCardService } from './ServiceHolyCard';
// Import to ensure eventEngine is initialized
import { eventEngine } from '@kbve/astropad';
import {
  Heart,
  Share2,
  Flag,
  Bookmark,
  MoreHorizontal,
  Star,
  Download,
  ExternalLink,
  Eye,
  MessageCircle
} from 'lucide-react';

// Icon mapper for string to component mapping
const iconMap = {
  heart: Heart,
  share: Share2,
  flag: Flag,
  bookmark: Bookmark,
  more: MoreHorizontal,
  star: Star,
  download: Download,
  external: ExternalLink,
  view: Eye,
  comment: MessageCircle,
} as const;

interface ReactHolyCardProps {
  cardId?: string;
  initialProps?: HolyCardProps;
  onCardClick?: (props: HolyCardProps) => void;
}

export const ReactHolyCard: React.FC<ReactHolyCardProps> = ({
  cardId = 'holy-card',
  initialProps,
  onCardClick,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Initialize this card instance in the service
  const cardInstance = holyCardService.initCard(cardId, initialProps);

  // Subscribe to this specific card's state
  const state = useStore(cardInstance.stateAtom);
  const props = useStore(cardInstance.propsAtom);
  const ready = useStore(cardInstance.readyComputed);

  useEffect(() => {
    if (initialProps) {
      holyCardService.setProps(cardId, initialProps);
    }
  }, [initialProps, cardId]);

  // Lazy loading intersection observer
  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement) return;

    const backgroundElement = cardElement.querySelector('.holy-card-background') as HTMLElement;
    if (!backgroundElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const bgSrc = backgroundElement.getAttribute('data-bg-src');
            if (bgSrc) {
              // Create optimized image URL for cards (smaller size)
              const optimizedSrc = bgSrc.includes('unsplash.com')
                ? bgSrc.replace(/w=\d+&h=\d+/, 'w=800&h=450')
                : bgSrc;

              // Preload the image
              const img = new Image();
              img.onload = () => {
                backgroundElement.style.backgroundImage = `url(${optimizedSrc})`;
                backgroundElement.classList.remove('loading');
                backgroundElement.classList.add('loaded');
              };
              img.onerror = () => {
                backgroundElement.classList.remove('loading');
                backgroundElement.style.backgroundImage = 'none';
                backgroundElement.style.backgroundColor = '#2a2a2a';
              };
              img.src = optimizedSrc;

              observer.unobserve(entry.target);
            }
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before the element comes into view
        threshold: 0.1
      }
    );

    observer.observe(cardElement);

    return () => {
      observer.disconnect();
    };
  }, [cardId]);

  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement) return;

    const handleMouseEnter = () => {
      holyCardService.setHovered(cardId, true);
      holyCardService.handleCardHover(cardId, true);
      cardElement.style.transform = 'translateY(-4px)';
      cardElement.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.2)';
    };

    const handleMouseLeave = () => {
      holyCardService.setHovered(cardId, false);
      holyCardService.handleCardHover(cardId, false);
      cardElement.style.transform = 'translateY(0)';
      cardElement.style.boxShadow = '';
    };

    // No card click handler - only button should be clickable

    const handleFocus = () => {
      holyCardService.setHovered(cardId, true);
      cardElement.style.transform = 'translateY(-2px)';
      cardElement.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
      cardElement.style.outline = '2px solid var(--sl-color-accent)';
      cardElement.style.outlineOffset = '2px';
    };

    const handleBlur = () => {
      holyCardService.setHovered(cardId, false);
      cardElement.style.transform = 'translateY(0)';
      cardElement.style.boxShadow = '';
      cardElement.style.outline = 'none';
    };

    cardElement.addEventListener('mouseenter', handleMouseEnter);
    cardElement.addEventListener('mouseleave', handleMouseLeave);
    cardElement.addEventListener('focus', handleFocus);
    cardElement.addEventListener('blur', handleBlur);

    return () => {
      cardElement.removeEventListener('mouseenter', handleMouseEnter);
      cardElement.removeEventListener('mouseleave', handleMouseLeave);
      cardElement.removeEventListener('focus', handleFocus);
      cardElement.removeEventListener('blur', handleBlur);
    };
  }, [cardId, onCardClick, props]);

  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement) return;

    if (state.isLoading) {
      cardElement.style.opacity = '0.7';
      cardElement.style.pointerEvents = 'none';
    } else {
      cardElement.style.opacity = '1';
      cardElement.style.pointerEvents = 'auto';
    }
  }, [state.isLoading, cardId]);

  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement || !props) return;

    const backgroundElement = cardElement.querySelector('.holy-card-background') as HTMLElement;
    const titleElement = cardElement.querySelector('.holy-card-title') as HTMLElement;
    const descriptionElement = cardElement.querySelector('.holy-card-description') as HTMLElement;
    const buttonElement = cardElement.querySelector('.holy-card-button') as HTMLElement;

    if (backgroundElement && props.backgroundImage) {
      backgroundElement.style.backgroundImage = `url(${props.backgroundImage})`;
    }

    if (titleElement && props.title) {
      titleElement.textContent = props.title;
    }

    if (descriptionElement && props.description) {
      descriptionElement.textContent = props.description;
    }

    if (buttonElement && props.buttonName) {
      buttonElement.textContent = props.buttonName;
      if (buttonElement instanceof HTMLAnchorElement && props.link) {
        buttonElement.href = props.link;
      }
    }
  }, [props, cardId]);

  const cardStyle = useMemo(() => ({
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    ...(state.isHovered && {
      filter: 'brightness(1.1)',
    }),
    ...(state.hasError && {
      filter: 'grayscale(100%) brightness(0.5)',
      pointerEvents: 'none' as const,
    }),
  }), [state.isHovered, state.hasError]);

  useEffect(() => {
    const cardElement = document.getElementById(cardId);
    if (cardElement && cardStyle) {
      Object.assign(cardElement.style, cardStyle);
    }
  }, [cardId, cardStyle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      holyCardService.destroyCard(cardId);
    };
  }, [cardId]);

  // Add event listeners to static icon buttons
  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement) return;

    const iconButtons = cardElement.querySelectorAll('.holy-card-icon-btn');

    iconButtons.forEach((button) => {
      const iconAction = button.getAttribute('data-action');
      const iconType = button.getAttribute('data-icon');

      const handleIconClick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        // Add click animation
        const btn = e.target as HTMLElement;
        const buttonElement = btn.closest('.holy-card-icon-btn') as HTMLElement;
        if (buttonElement) {
          buttonElement.style.transform = 'scale(0.9)';
          setTimeout(() => {
            buttonElement.style.transform = '';
          }, 150);
        }

        // Emit event
        if (iconAction) {
          holyCardService.handleIconClick(cardId, iconAction, { icon: iconType });
        }
      };

      // Add keyboard support
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleIconClick(e);
        }
      };

      button.addEventListener('click', handleIconClick);
      button.addEventListener('keydown', handleKeyDown);
    });

    return () => {
      // Cleanup event listeners
      iconButtons.forEach((button) => {
        button.removeEventListener('click', () => {});
        button.removeEventListener('keydown', () => {});
      });
    };
  }, [cardId]);

  if (!ready && !initialProps) {
    return null;
  }

  return (
    <div
      style={{ display: 'none' }}
      data-react-holy-card-controller
      data-card-id={cardId}
    />
  );
};
