'use client';

import { useEffect } from 'react';

/**
 * This component handles global layout adjustments when a resizable panel is open
 * It should be included once in the root layout
 */
export default function PanelLayoutEffect() {
  useEffect(() => {
    // Add console logs to debug
    console.log('PanelLayoutEffect mounted');
    
    const handleResize = () => {
      console.log('Handling resize');
      // Adjust layout if needed on window resize
      // This helps ensure responsiveness when the panel is open
      const panelWidth = getComputedStyle(document.documentElement).getPropertyValue('--panel-width');
      console.log('Panel width:', panelWidth);
      
      const hasPanelOpen = panelWidth && panelWidth !== '0px';
      
      // Update any elements that need to be responsive to the panel
      const mainContainer = document.querySelector('main');
      if (mainContainer && hasPanelOpen) {
        console.log('Adding panel-adjusted class to main');
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
        console.log('Adding panel-open class to body');
        document.body.classList.add('panel-open');
        // Force body background to be visible
        document.body.style.background = 'linear-gradient(90deg, #fee140 0%, #fa709a 100%)';
        document.body.style.color = '#fff';
      } else {
        document.body.classList.remove('panel-open');
      }
      
      // Ensure panel is on top of other elements
      const panel = document.querySelector('.fixed.right-0.h-screen');
      if (panel) {
        console.log('Adding z-[100] class to panel');
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
      console.log('PanelLayoutEffect unmounted');
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      bodyObserver.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
} 