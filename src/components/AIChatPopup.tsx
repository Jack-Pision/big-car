import React, { useState } from 'react';

const ICON_PATH = '/ICON TEHOM 2.png'; // Assuming public/ is the static root, but file is in project root, so will move if needed

const AIChatPopup: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating chat icon button */}
      {!open && (
        <button
          className="fixed bottom-8 right-8 z-50 bg-[#161618] border border-gray-400/60 rounded-full shadow-lg p-3 hover:scale-105 transition-transform"
          style={{ boxShadow: '0 2px 16px 0 rgba(0,0,0,0.18)' }}
          onClick={() => setOpen(true)}
          aria-label="Open AI Chat"
        >
          <img src={ICON_PATH} alt="AI Chat" className="w-8 h-8" />
        </button>
      )}

      {/* Chat popup */}
      {open && (
        <div className="fixed bottom-8 right-8 z-50 w-80 max-w-[90vw] bg-[#161618] border border-gray-300 rounded-2xl shadow-2xl flex flex-col" style={{ minHeight: '400px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300/60">
            <div className="flex items-center gap-2">
              <img src={ICON_PATH} alt="AI Chat" className="w-6 h-6" />
              <span className="font-semibold text-gray-100 text-base">Tehom AI</span>
            </div>
            <button
              className="text-gray-400 hover:text-gray-200 text-xl px-2"
              onClick={() => setOpen(false)}
              aria-label="Close AI Chat"
            >
              &times;
            </button>
          </div>
          {/* Chat content placeholder */}
          <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center text-gray-400">
            <span className="text-center">AI chat coming soon...</span>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatPopup; 