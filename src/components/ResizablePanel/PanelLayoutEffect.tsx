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
      
      // Update any fixed bottom inputs
      const inputContainer = document.querySelector('.floating-input-card');
      if (inputContainer && hasPanelOpen) {
        inputContainer.classList.add('panel-adjusted-input');
      } else if (inputContainer) {
        inputContainer.classList.remove('panel-adjusted-input');
      }
      
      // Add class to body for other styling purposes
      if (hasPanelOpen) {
        document.body.classList.add('panel-open');
      } else {
        document.body.classList.remove('panel-open');
      }
      
      // Ensure panel is on top of other elements
      const panel = document.querySelector('.fixed.right-0.h-screen');
      if (panel) {
        // Force the panel to have a higher z-index than any other elements
        panel.classList.add('z-[100]');
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
    
    // Create another observer for body class changes
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