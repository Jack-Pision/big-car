import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-[#0A0A0A] shadow-xl py-4 sticky top-0 z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-white text-2xl font-bold tracking-wide">Tehom AI</h1>
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