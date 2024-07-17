import React, { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';

const $displayedText = atom<JSX.Element[]>([]);

interface TypewriterComponentProps {
  text: string;
  speed?: number;
}

const TypewriterComponent: React.FC<TypewriterComponentProps> = ({ text, speed = 50 }) => {
  const displayedText = useStore($displayedText);
  const displayedTextRef = useRef<JSX.Element[]>([]);
  
  useEffect(() => {
    let timeoutId: number;
    let currentIndex = 0;

    // Match spans and split text accordingly
    const parts = text.split(/(<\/?span[^>]*>)/g).filter(Boolean);
    const characters: JSX.Element[] = [];

    parts.forEach((part, index) => {
      if (part.startsWith('<span')) {
        characters.push(<span key={currentIndex++} dangerouslySetInnerHTML={{ __html: part }} />);
      } else if (part.startsWith('</span')) {
        characters.push(<span key={currentIndex++} dangerouslySetInnerHTML={{ __html: part }} />);
      } else {
        part.split('').forEach(char => {
          characters.push(<span key={currentIndex++}>{char}</span>);
        });
      }
    });

    currentIndex = 0;

    const typeNextCharacter = () => {
      if (currentIndex < characters.length) {
        displayedTextRef.current = [...displayedTextRef.current, characters[currentIndex]];
        $displayedText.set(displayedTextRef.current);
        currentIndex++;
        timeoutId = window.setTimeout(typeNextCharacter, speed);
      }
    };

    displayedTextRef.current = [];
    $displayedText.set(displayedTextRef.current);
    typeNextCharacter();

    return () => window.clearTimeout(timeoutId);
  }, [text, speed]);

  return <div>{displayedText}</div>;
};

export default TypewriterComponent;
