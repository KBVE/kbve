import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useStore } from '@nanostores/react';
import { kbve$ } from '@kbve/khashvault';

const DynamicInsert = () => {
  const [isMounted, setIsMounted] = useState(false);
  const $kbve$ = useStore(kbve$);

  useEffect(() => {
    const interval = setInterval(() => {
      const container = document.getElementById('block-content-a');
      if (container && !isMounted) {
        ReactDOM.render(<ContentBlock />, container);
        setIsMounted(true);  // Ensure we don't attempt to mount again
        clearInterval(interval);  // Stop checking once mounted
      }
    }, 100);  // Check every 100 milliseconds

    return () => clearInterval(interval);  // Clean up interval on component unmount
  }, [isMounted]);

  const ContentBlock = () => (
    <div className="min-w rounded-md shadow-md dark:bg-gray-900 dark:text-gray-100">
      <img src="https://source.unsplash.com/random/300x300/?2" alt="" className="object-cover object-center w-full rounded-t-md min-h dark:bg-gray-500" />
      <div className="flex flex-col justify-between p-6 space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracki">Dat Widget</h2>
          <p className="dark:text-gray-100">Welcome {$kbve$.username || 'Guest'}</p>
        </div>
        <button type="button" className="flex items-center justify-center w-full p-3 font-semibold trackig rounded-md dark:bg-cyan-400 dark:text-gray-900">
          Read more
        </button>
      </div>
    </div>
  );

  // Render nothing since we manually handle rendering
  return null;
};

export default DynamicInsert;
