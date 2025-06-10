import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const Layout: React.FC = () => {
  // Add an effect to handle resize events and adjust layout accordingly
  useEffect(() => {
    const handleResize = () => {
      // Adjust layout if needed on window resize
      // This helps ensure responsiveness when the panel is open
      const panelWidth = getComputedStyle(document.documentElement).getPropertyValue('--panel-width');
      const hasPanelOpen = panelWidth && panelWidth !== '0px';
      
      // Update any elements that need to be responsive to the panel
      const mainContainer = document.querySelector('main');
      if (mainContainer && hasPanelOpen) {
        mainContainer.classList.add('panel-adjusted');
      } else if (mainContainer) {
        mainContainer.classList.remove('panel-adjusted');
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Create a MutationObserver to watch for style changes on documentElement
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'style') {
          handleResize();
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    
    // Run once on mount to set initial state
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen relative">
      <Header />
      <main className="flex-1 transition-all duration-300 relative z-0">
        <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Layout; 