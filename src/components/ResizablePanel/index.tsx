import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

interface ResizablePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  isOpen,
  onClose,
  title = "Advanced Search Results",
  children,
  initialWidth = 420, // Increased default width
  minWidth = 300,
  maxWidth = 800
}) => {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Handle resize drag operation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width based on mouse position
      // Use window.innerWidth - e.clientX to get the width from the right side
      const newWidth = window.innerWidth - e.clientX;
      
      // Apply min/max constraints
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      setWidth(clampedWidth);
      
      // Update document body style to make the main content responsive
      document.body.style.paddingRight = `${clampedWidth}px`;
      document.documentElement.style.setProperty('--panel-width', `${clampedWidth}px`);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection during resize
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  // Apply/remove panel width effect on mount/unmount
  useEffect(() => {
    if (isOpen) {
      document.body.style.paddingRight = `${width}px`;
      document.documentElement.style.setProperty('--panel-width', `${width}px`);
      // Add a class to the body to help with styling
      document.body.classList.add('panel-open');
      
      // Force all other panels to lower z-index if possible
      const otherPanels = document.querySelectorAll('[class*="panel"]:not(#panel-root)');
      otherPanels.forEach(panel => {
        if (panel instanceof HTMLElement) {
          panel.style.zIndex = '1';
        }
      });
    }
    
    return () => {
      document.body.style.paddingRight = '0';
      document.documentElement.style.setProperty('--panel-width', '0px');
      document.body.classList.remove('panel-open');
    };
  }, [isOpen, width]);

  // Start resize operation
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* The panel itself - ultra high z-index */}
      <div 
        id="panel-root"
        className="fixed inset-0 right-0 flex flex-col transition-all duration-300"
        style={{ 
          width: `${width}px`,
          zIndex: 99995,
          height: '100vh',
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 'auto',
        }}
        ref={panelRef}
      >
        {/* Resize handle - wider for better UX */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-6 cursor-ew-resize flex items-center justify-center"
          style={{ 
            zIndex: 99996,
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            height: '100%',
          }}
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
        >
          {/* Visual indicator for resize handle */}
          <div className="w-1.5 h-32 bg-cyan-500 rounded-full opacity-90 hover:opacity-100 hover:bg-cyan-400 transition-all shadow-[0_0_12px_rgba(0,255,255,0.6)]"></div>
        </div>
        
        {/* Panel content */}
        <div 
          className="flex-1 bg-black/95 border-l-2 border-cyan-800/60 overflow-y-auto overflow-x-hidden w-full h-full shadow-2xl" 
          style={{ 
            boxShadow: '-6px 0 25px rgba(0, 0, 0, 0.7)',
            zIndex: 99997,
            height: '100vh',
            minHeight: '100%',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 pt-6 h-full flex flex-col">
            <div 
              className="flex justify-between items-center mb-6 sticky top-0 bg-black/95 py-3 border-b border-cyan-900/40"
              style={{ zIndex: 99998 }}
            >
              <h2 className="text-xl text-white font-medium">{title}</h2>
              <button 
                className="text-white hover:text-cyan-400 transition-colors p-2"
                onClick={onClose}
                aria-label="Close panel"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="space-y-4 pb-20 flex-1 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResizablePanel; 