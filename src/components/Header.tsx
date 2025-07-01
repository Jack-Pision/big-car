import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-[#0A0A0A] shadow-xl py-4 sticky top-0 z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <h1 className="text-white text-xl font-semibold">AI Study App</h1>
          </div>
          
          <nav>
            <ul className="flex space-x-6">
              <li>
                <a href="/" className="text-white hover:text-cyan-400 transition-colors">
                  Home
                </a>
              </li>
              <li>
                <a href="/search" className="text-white hover:text-cyan-400 transition-colors">
                  Search
                </a>
              </li>
              <li>
                <a href="/about" className="text-white hover:text-cyan-400 transition-colors">
                  About
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header; 