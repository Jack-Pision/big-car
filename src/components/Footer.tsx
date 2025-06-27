import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-black/75 text-neutral-300 py-6 sticky bottom-0 z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-sm">© {new Date().getFullYear()} AI Study App. All rights reserved.</p>
          </div>
          
          <div className="flex space-x-6">
            <a href="#" className="text-neutral-300 hover:text-cyan-400 transition-colors">
              Terms
            </a>
            <a href="#" className="text-neutral-300 hover:text-cyan-400 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-neutral-300 hover:text-cyan-400 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;