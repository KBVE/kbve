import React, { useEffect, useState, CSSProperties } from 'react';

const RandomCharacters: React.FC = () => {
  const [characters, setCharacters] = useState<JSX.Element[]>([]);

  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const tempChars: JSX.Element[] = [];
    for (let i = 0; i < 200; i++) { 
      const char = chars[Math.floor(Math.random() * chars.length)];
      const style: CSSProperties = {
        left: `${Math.random() * 100}%`,
        top: `-10vh`,
        animation: `rain ${Math.random() * 5 + 5}s infinite linear`,
        position: 'absolute',
        color: 'green', 
        fontSize: '20px', 
      };
      tempChars.push(<span key={i} style={style}>{char}</span>);
    }
    setCharacters(tempChars);
  }, []);

  return (
    <div className="w-full h-screen flex justify-center items-center overflow-hidden relative bg-zinc-950">
      <div className="absolute w-full h-full flex flex-wrap items-center justify-center z-0">
        {characters}
      </div>
      <div className="z-10 text-white text-4xl">Hi</div> // Main content stays on top
    </div>
  );
};

export default RandomCharacters;