import React from 'react';

const Search: React.FC = () => {
  return (
    <div
      className="w-full mx-auto rounded-lg overflow-hidden bg-[#171717] border border-white/20"
      style={{ borderRadius: '20px', maxWidth: '969px', minHeight: '300px' }}
    >
      <div
        className="relative flex items-center px-6 py-4 bg-[#171717]"
        style={{ minHeight: '64px' }}
      >
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17" cy="7" r="2" />
            <circle cx="7" cy="17" r="2" />
            <line x1="14.15" y1="14.15" x2="17" y2="17" />
            <line x1="9.85" y1="9.85" x2="7" y2="7" />
          </svg>
          <span className="text-lg font-semibold text-white">Search Results</span>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            stroke="#E5E5E5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default Search; 