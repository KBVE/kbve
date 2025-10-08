/** @jsxImportSource react */

import React, { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { type HolyCardProps, holyCardService } from './ServiceHolyCard';

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

  useEffect(() => {
    const cardElement = cardRef.current || document.getElementById(cardId);
    if (!cardElement) return;

    const handleMouseEnter = () => {
      holyCardService.setHovered(cardId, true);
      cardElement.style.transform = 'translateY(-4px)';
      cardElement.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.2)';
    };

    const handleMouseLeave = () => {
      holyCardService.setHovered(cardId, false);
      cardElement.style.transform = 'translateY(0)';
      cardElement.style.boxShadow = '';
    };

    const handleClick = (e: Event) => {
      e.preventDefault();
      if (props) {
        if (onCardClick) {
          onCardClick(props);
        } else {
          holyCardService.handleCardClick(cardId);
        }
      }
    };

    cardElement.addEventListener('mouseenter', handleMouseEnter);
    cardElement.addEventListener('mouseleave', handleMouseLeave);
    cardElement.addEventListener('click', handleClick);

    return () => {
      cardElement.removeEventListener('mouseenter', handleMouseEnter);
      cardElement.removeEventListener('mouseleave', handleMouseLeave);
      cardElement.removeEventListener('click', handleClick);
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
