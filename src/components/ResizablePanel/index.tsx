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

  // Start resize operation
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="flex fixed top-0 right-0 h-full z-50 overflow-hidden transition-all duration-300"
      style={{ width: `${width}px` }}
      ref={panelRef}
    >
      {/* Resize handle */}
      <div 
        className="absolute left-0 top-0 w-2 h-full cursor-ew-resize z-10 hover:bg-cyan-500/20"
        ref={resizeHandleRef}
        onMouseDown={handleResizeStart}
      />
      
      {/* Panel content */}
      <div className="flex-1 bg-black/95 border-l border-neutral-800 overflow-y-auto overflow-x-hidden" 
        style={{ boxShadow: '-4px 0 15px rgba(0, 0, 0, 0.3)' }}
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl text-white font-medium">{title}</h2>
            <button 
              className="text-white hover:text-cyan-400 transition-colors"
              onClick={onClose}
              aria-label="Close panel"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div className="space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResizablePanel; 