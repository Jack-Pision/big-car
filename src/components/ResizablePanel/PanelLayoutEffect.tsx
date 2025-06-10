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

  // This component doesn't render anything
  return null;
} 