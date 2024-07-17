import React, { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { WritableAtom } from 'nanostores';

interface TypewriterComponentProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  textAtom: WritableAtom;
}

const TypewriterComponent: React.FC<TypewriterComponentProps> = ({ text, speed = 50, onComplete, textAtom }) => {
  const displayedText = useStore(textAtom);
  const displayedTextRef = useRef<JSX.Element[]>([]);

  useEffect(() => {
    let timeoutId: number;
    let currentIndex = 0;

    const parts = text.split(/(<\/?span[^>]*>)/g).filter(Boolean);
    const characters: JSX.Element[] = [];

    parts.forEach((part) => {
      if (part.startsWith('<span') || part.startsWith('</span')) {
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
        textAtom.set(displayedTextRef.current);
        currentIndex++;
        timeoutId = window.setTimeout(typeNextCharacter, speed);
      } else if (onComplete) {
        onComplete();
      }
    };

    displayedTextRef.current = [];
    textAtom.set(displayedTextRef.current);
    typeNextCharacter();

    return () => {
      window.clearTimeout(timeoutId);
      textAtom.set([]); // Reset the atom when the component is unmounted
    };
  }, [text, speed, onComplete]);

  return <div>{displayedText}</div>;
};

export default TypewriterComponent;
