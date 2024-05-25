import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '@nanostores/react';
import { kbve$, atlas$, addOrUpdatePlugin, updatePluginState, updatePluginError, updatePluginMessage } from '@kbve/khashvault';

const ContentBlock = () => {
  const $kbve$ = useStore(kbve$);
  const $atlas$ = useStore(atlas$);
  const plugin = $atlas$.plugin?.[1];

  return (
    <div className="min-w rounded-md shadow-md">
      <img
        src="https://source.unsplash.com/random/300x300/?2"
        alt=""
        className="object-cover object-center w-full rounded-t-md h-32 dark:bg-gray-500"
      />
      <div className="flex flex-col justify-between p-6 space-y-4 bg-gray-300 dark:bg-gray-900/[.80] dark:text-gray-100">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracki">RuneLite Widget</h2>
          <p className="dark:text-gray-100">
            Welcome {$kbve$.username || 'Guest'} <br />
            Status: {plugin ? plugin.state : 'unknown'} <br />
            Message: {$atlas$.plugin?.[1] ? $atlas$.plugin?.[1].message : 'No Message.' } <br />
            Error: {$atlas$.plugin?.[1] ? $atlas$.plugin?.[1].error : 'No Error.' } <br />
          </p>
        </div>
        <button
          type="button"
          className="flex items-center justify-center w-full p-3 font-semibold trackig rounded-md dark:bg-cyan-400 dark:text-gray-900"
          onClick={handleButtonClick}
        >
          Launch RuneLite
        </button>
      </div>
    </div>
  );
};

const handleButtonClick = async () => {
  await addOrUpdatePlugin(1, '...', 'Loading RuneLite', 'process');
  try {
    const response = await fetch(
      'http://localhost:8086/start-runelite',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      await updatePluginError(1, '...');
      await updatePluginMessage(1, 'Started!');
      console.log('RuneLite started successfully:', data);
      await updatePluginState(1, 'active');
    } else {
      console.error('Failed to start RuneLite:', response.statusText);
      await updatePluginError(1, 'Failed to start');
      await updatePluginMessage(1, 'Try to launch again');
      await updatePluginState(1, 'disable');
    }
  } catch (error) {
    console.error('Error starting RuneLite:', error);
    await updatePluginError(1, `Error with starting RuneLite Plugin ${error}`);
    await updatePluginState(1, 'error');
  }
};

const DynamicInsert = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      const container = document.getElementById('block-content-a');
      if (container) {
        const root = createRoot(container);
        root.render(<ContentBlock />);
        clearInterval(interval); // Stop checking once mounted
      }
    }, 100); // Check every 100 milliseconds

    return () => clearInterval(interval); // Clean up interval on component unmount
  }, []);

  return null; // Render nothing since we manually handle rendering
};

export default DynamicInsert;
