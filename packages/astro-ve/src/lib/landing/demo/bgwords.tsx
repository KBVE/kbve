// bgwords.tsx
import React, { useEffect, useState, CSSProperties } from 'react';

const words = ["Hello", "World", "React", "Animation", "Raining"];

const RandomCharacters: React.FC = () => {
  const [columns, setColumns] = useState<JSX.Element[]>([]);
  const [showComponent, setShowComponent] = useState(false); // Controls rendering of the component

  useEffect(() => {
    const tempColumns = words.map((word, index) => {
      const letters = word.split('').map((letter, idx) => (
        <div key={idx} className="text-cyan-700 opacity-90" style={{ fontSize: '20px', position: 'relative' }}>
          {letter}
        </div>
      ));

      const style: CSSProperties = {
        left: `${5 + index * (100 / words.length)}%`, 
        top: `-10vh`, 
        animation: `rain ${Math.random() * 5 + 5}s infinite linear`,
        position: 'absolute',
      };

      return (
        <div key={index} style={style}>
          {letters}
        </div>
      );
    });

    setColumns(tempColumns);

    // Manage the loader and set when to display the component
    setTimeout(() => {
      const loader = document.getElementById('herolanding_loader');
      if (loader) {
        loader.classList.add('fade-out'); // Start fade-out animation
        loader.addEventListener('animationend', () => {
          loader.style.display = 'none'; // Ensure loader is not displayed after fading
          setShowComponent(true); // Only then show the component
        });
      }
    }, 1000); // Simulates a loading process; adjust as necessary

  }, []);

  return showComponent ? (
    <div className="w-full h-screen flex justify-center items-center overflow-hidden relative">
      <div className="absolute w-full h-full z-0">
        {columns}
      </div>
      <div className="z-10 text-white text-4xl">Welcome to Next Generation Software Development Community</div>
    </div>
  ) : null;
};

export default RandomCharacters;
