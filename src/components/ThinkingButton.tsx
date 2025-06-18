'use client';
import React, { useState, useEffect, useRef } from 'react';

interface ThinkingButtonProps {
  content: string;
  isLive?: boolean;
}

const ThinkingButton: React.FC<ThinkingButtonProps> = ({ content, isLive = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start duration tracking when thinking begins
  useEffect(() => {
    if (isLive && !startTime) {
      setStartTime(Date.now());
      setDuration(0);
    } else if (!isLive && startTime) {
      // Stop tracking when thinking ends
      const finalDuration = Math.floor((Date.now() - startTime) / 1000);
      setDuration(finalDuration);
      setStartTime(null);
    }
  }, [isLive, startTime]);

  // Update duration every second during live thinking
  useEffect(() => {
    if (isLive && startTime) {
      intervalRef.current = setInterval(() => {
        const currentDuration = Math.floor((Date.now() - startTime) / 1000);
        setDuration(currentDuration);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLive, startTime]);

  // Auto-scroll to bottom during live thinking
  useEffect(() => {
    if (isLive && isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isLive, isExpanded]);

  // Auto-expand during live thinking
  useEffect(() => {
    if (isLive) {
      setIsExpanded(true);
    }
  }, [isLive]);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  return (
    <div className="my-4">
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ease-in-out"
        style={{ 
          backgroundColor: '#1a1a1a',
          borderColor: '#333333'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Atom icon */}
          <div className="w-5 h-5 flex-shrink-0">
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#9ca3af"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6"/>
              <path d="m21 12-6-3-6 3-6-3"/>
              <path d="m21 12-6 3-6-3-6 3"/>
              <path d="M12 1 9 9l3 3 3-3z"/>
              <path d="M12 23l3-9-3-3-3 3z"/>
            </svg>
          </div>
          
          {/* Title text */}
          <span className="text-gray-300 font-medium text-sm flex-1">
            {isLive ? `Thinking ${formatDuration(duration)}` : `Thought for ${formatDuration(duration)}`}
          </span>
          
          {/* Expand/collapse chevron */}
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#9ca3af" 
            strokeWidth="2"
            className={`transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </div>
        
        {/* Expanded content */}
        {isExpanded && (
          <div 
            ref={contentRef}
            className="px-4 pb-4 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
            style={{
              scrollBehavior: isLive ? 'smooth' : 'auto'
            }}
          >
            <div className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap select-text">
              {content || 'Starting to think...'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingButton; 