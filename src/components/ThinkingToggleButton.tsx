'use client';
import React from 'react';

interface ThinkingToggleButtonProps {
  isActive: boolean;
  onClick: () => void;
}

const ThinkingToggleButton: React.FC<ThinkingToggleButtonProps> = ({ isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${isActive ? 'bg-blue-600' : 'bg-gray-700'}`}
      aria-label="Toggle thinking mode"
    >
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="1"/>
        <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z"/>
        <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z"/>
      </svg>
    </button>
  );
};

export default ThinkingToggleButton; 