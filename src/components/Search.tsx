import React from 'react';

const Search: React.FC = () => {
  return (
    <div className="w-full mx-auto rounded-lg overflow-hidden shadow-lg bg-[#171717] border border-neutral-800" style={{ borderRadius: '20px', maxWidth: '969px', minHeight: '350px', height: '350px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <div className="flex flex-col items-center justify-center h-full w-full">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <h2 className="text-lg font-normal text-neutral-200 mb-2">Search Panel</h2>
        <p className="text-neutral-400 text-base">This is a placeholder for the Search UI.</p>
      </div>
    </div>
  );
};

export default Search; 