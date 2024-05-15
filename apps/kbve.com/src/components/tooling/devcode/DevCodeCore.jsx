// src/DevCodeCore.jsx

import React, { useState, useEffect } from 'react';
import parse from 'html-react-parser';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getHighlightedCode } from './ShikiHelper';

const DevCodeCore = ({ htmlCode }) => {
  const [activeTab, setActiveTab] = useState('preview');
  const [highlightedCode, setHighlightedCode] = useState('');

  useEffect(() => {
    const highlightCode = async () => {
      const highlighted = await getHighlightedCode(htmlCode);
      setHighlightedCode(highlighted);
    };
    highlightCode();
  }, [htmlCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(htmlCode);
    //alert('Code copied to clipboard!');
  };

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="flex border-b border-gray-200">
        <motion.button
          className={twMerge(
            'py-2 text-center cursor-pointer',
            clsx({
              'bg-[var(--sl-color-black)] border-b-2 border-blue-500 font-bold': activeTab === 'preview',
              'opacity-50': activeTab !== 'preview',
            })
          )}
          style={{ flex: activeTab === 'preview' ? 2 : 1 }}
          onClick={() => setActiveTab('preview')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Preview
        </motion.button>
        <motion.button
          className={twMerge(
            'py-2 text-center cursor-pointer',
            clsx({
              'bg-[var(--sl-color-black)] border-b-2 border-blue-500 font-bold': activeTab === 'code',
              'opacity-50': activeTab !== 'code',
            })
          )}
          style={{ flex: activeTab === 'code' ? 2 : 1 }}
          onClick={() => setActiveTab('code')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Code
        </motion.button>
      </div>
      <div className="p-4">
        {activeTab === 'preview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose max-w-none"
          >
            {parse(htmlCode)}
          </motion.div>
        )}
        {activeTab === 'code' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="relative">
              <button
                className="absolute right-0 top-0 bg-cyan-600 text-white px-2 py-1 rounded"
                onClick={handleCopy}
              >
                Copy
              </button>
              <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default DevCodeCore;
