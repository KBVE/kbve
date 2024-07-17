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

    parts.forEach((part, index) => {
      if (part.startsWith('<span') || part.startsWith('</span')) {
        const tagMatch = part.match(/<span class="([^"]*)">/);
        if (tagMatch) {
          const className = tagMatch[1];
          characters.push(<span key={`span-${index}`} className={className}></span>);
        } else {
          characters.push(<span key={`span-${index}`}></span>);
        }
      } else {
        part.split('').forEach((char, charIndex) => {
          characters.push(<span key={`char-${index}-${charIndex}`}>{char}</span>);
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
