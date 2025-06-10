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
  initialWidth = 384, // w-96
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
      
      // Add a class to indicate panel is open - helps with styling other elements
      document.body.classList.add('panel-open');
      
      // Update any input container width
      const inputContainer = document.querySelector('.floating-input-card');
      if (inputContainer) {
        inputContainer.classList.add('panel-adjusted-input');
      }
      
      // Log for debugging
      console.log('Panel resized to width:', clampedWidth);
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
    console.log('ResizablePanel effect. isOpen:', isOpen);
    
    if (isOpen) {
      document.body.style.paddingRight = `${width}px`;
      document.documentElement.style.setProperty('--panel-width', `${width}px`);
      document.body.classList.add('panel-open');
      
      // Update any input container width
      const inputContainer = document.querySelector('.floating-input-card');
      if (inputContainer) {
        inputContainer.classList.add('panel-adjusted-input');
      }
      
      console.log('Panel opened with width:', width);
    }
    
    return () => {
      document.body.style.paddingRight = '0';
      document.documentElement.style.setProperty('--panel-width', '0px');
      document.body.classList.remove('panel-open');
      
      // Reset input container width
      const inputContainer = document.querySelector('.floating-input-card');
      if (inputContainer) {
        inputContainer.classList.remove('panel-adjusted-input');
      }
      
      console.log('Panel closed');
    };
  }, [isOpen, width]);

  // Start resize operation
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    console.log('Started resizing panel');
  };

  if (!isOpen) return null;
  
  console.log('Rendering panel with width:', width);

  return (
    <div 
      className="fixed top-0 right-0 h-screen z-[9999] flex flex-col transition-all duration-300"
      style={{ 
        width: `${width}px`, 
        display: 'flex',
        visibility: 'visible',
        opacity: 1
      }}
      ref={panelRef}
    >
      {/* Resize handle - wider for better UX */}
      <div 
        className="absolute left-0 top-0 w-4 h-full cursor-ew-resize z-10 flex items-center justify-center"
        ref={resizeHandleRef}
        onMouseDown={handleResizeStart}
      >
        {/* Visual indicator for resize handle */}
        <div className="w-1 h-16 bg-neutral-700 rounded-full opacity-50 hover:opacity-100 hover:bg-cyan-500 transition-all"></div>
      </div>
      
      {/* Panel content */}
      <div className="flex-1 bg-black/95 border-l border-neutral-800 overflow-y-auto overflow-x-hidden w-full h-full" 
        style={{ 
          boxShadow: '-4px 0 15px rgba(0, 0, 0, 0.3)',
          paddingTop: '56px',  // Header height
          paddingBottom: '56px', // Footer height
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="p-4 h-full">
          <div className="flex justify-between items-center mb-6 sticky top-0 bg-black/95 py-2 z-10">
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
          
          <div className="space-y-4 pb-16">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResizablePanel; 