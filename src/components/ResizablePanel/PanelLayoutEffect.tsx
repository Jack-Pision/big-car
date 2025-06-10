'use client';

import { useEffect } from 'react';

/**
 * This component handles global layout adjustments when a resizable panel is open
 * It should be included once in the root layout
 */
export default function PanelLayoutEffect() {
  useEffect(() => {
    const handleResize = () => {
      // Adjust layout if needed on window resize
      // This helps ensure responsiveness when the panel is open
      const panelWidth = getComputedStyle(document.documentElement).getPropertyValue('--panel-width');
      const hasPanelOpen = panelWidth && panelWidth !== '0px';
      
      // Update any elements that need to be responsive to the panel
      const mainContainer = document.querySelector('main');
      const header = document.querySelector('header');
      const footer = document.querySelector('footer');
      const inputContainer = document.querySelector('.chat-input-container');
      
      if (hasPanelOpen) {
        // Apply panel-adjusted class to main container
        mainContainer?.classList.add('panel-adjusted');
        
        // Ensure header and footer don't overlap panel
        if (header) {
          header.classList.add('panel-adjusted');
        }
        
        if (footer) {
          footer.classList.add('panel-adjusted');
        }
        
        // Adjust input width if exists
        if (inputContainer) {
          inputContainer.classList.add('panel-adjusted');
        }
      } else {
        // Remove adjustments when panel is closed
        mainContainer?.classList.remove('panel-adjusted');
        header?.classList.remove('panel-adjusted');
        footer?.classList.remove('panel-adjusted');
        inputContainer?.classList.remove('panel-adjusted');
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
    
    // Create another observer to watch for class changes on body
    const bodyObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          handleResize();
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    bodyObserver.observe(document.body, { attributes: true });
    
    // Run once on mount to set initial state
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      bodyObserver.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
} 