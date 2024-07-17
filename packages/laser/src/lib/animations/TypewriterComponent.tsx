import React, { useEffect, useState, useRef } from 'react';

interface TypewriterComponentProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

const TypewriterComponent: React.FC<TypewriterComponentProps> = ({ text, speed = 80, onComplete }) => {
  const [displayedText, setDisplayedText] = useState<JSX.Element[]>([]);
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
        setDisplayedText([...displayedTextRef.current]);
        currentIndex++;
        timeoutId = window.setTimeout(typeNextCharacter, speed);
      } else if (onComplete) {
        onComplete();
      }
    };

    displayedTextRef.current = [];
    setDisplayedText([]);
    typeNextCharacter();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [text, speed, onComplete]);

  return <div>{displayedText}</div>;
};

export default React.memo(TypewriterComponent);
