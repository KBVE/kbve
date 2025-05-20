/** @jsxImportSource react */
import { useEffect, useState } from 'react';

export default function HeroInteractive(): JSX.Element {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Hide skeleton spinner once React is mounted
    const spinner = document.getElementById('hero-spinner');
    if (spinner) {
      spinner.remove();
    }

    const timeout = setTimeout(() => setRevealed(true), 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div
      className="transition-opacity duration-700 ease-out"
      style={{ opacity: revealed ? 1 : 0 }}
    >
      <button
        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg animate-bounce"
        onClick={() => alert("Let's build something awesome!")}
        aria-label="Join KBVE"
      >
        Join the Journey 🚀
      </button>
    </div>
  );
}
