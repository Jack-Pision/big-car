'use client';
import React from 'react';

interface ThinkingButtonProps {
  active: boolean;
  onClick: () => void;
}

const ThinkingButton: React.FC<ThinkingButtonProps> = ({ active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center px-3 py-2 rounded-lg transition-colors ${
        active 
          ? 'bg-cyan-600 text-white hover:bg-cyan-700' 
          : 'bg-[#2C2C2E] text-gray-300 hover:bg-gray-700'
      }`}
      title={active ? 'Thinking mode active' : 'Enable thinking mode'}
    >
      <svg 
        width="18" 
        height="18" 
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
      <span className="ml-2 text-base">Think</span>
    </button>
  );
};

export default ThinkingButton; 