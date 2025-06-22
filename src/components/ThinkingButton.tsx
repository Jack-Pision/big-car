'use client';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

interface ThinkingButtonProps {
  content: string;
  isLive?: boolean;
  mode?: 'reasoning' | 'default';
}

const ThinkingButton: React.FC<ThinkingButtonProps> = ({ content, isLive = false, mode = 'default' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const collapsedContentRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to bottom during live thinking - works in both collapsed and expanded states
  useEffect(() => {
    if (isLive) {
      if (isExpanded && contentRef.current) {
        // Auto-scroll in expanded state
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      } else if (!isExpanded && mode === 'reasoning' && collapsedContentRef.current) {
        // Auto-scroll in collapsed state for reasoning mode
        collapsedContentRef.current.scrollTop = collapsedContentRef.current.scrollHeight;
      }
    }
  }, [content, isLive, isExpanded, mode]);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };
  
  return (
    <div className="my-4 w-full max-w-4xl mx-auto">
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden transition-all duration-300 ease-in-out w-full"
        style={{ 
          backgroundColor: '#1a1a1a',
          borderColor: '#333333'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Atom icon */}
          <div className="w-5 h-5 flex-shrink-0">
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#FCFCFC" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1"/>
              <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z"/>
              <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z"/>
            </svg>
          </div>
          
          {/* Title text */}
          <span className="font-medium text-sm flex-1" style={{ color: '#FCFCFC' }}>
            {isLive ? 'Thinking' : 'Thoughts'}
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
        
        {/* Collapsed content preview (only for Reasoning mode) */}
        {!isExpanded && mode === 'reasoning' && (
          <div 
            ref={collapsedContentRef}
            className="px-4 pb-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
            style={{ 
              height: '140px',
              scrollBehavior: isLive ? 'smooth' : 'auto'
            }}
          >
            <div 
              className="text-sm leading-relaxed select-text research-output"
              style={{ color: '#FCFCFC' }}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {content || 'Starting to think...'}
              </ReactMarkdown>
            </div>
          </div>
        )}
        
        {/* Expanded content */}
        {isExpanded && (
          <div 
            ref={contentRef}
            className="px-4 pb-4 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
            style={{
              scrollBehavior: isLive ? 'smooth' : 'auto'
            }}
          >
            <div className="text-sm leading-relaxed select-text research-output" style={{ color: '#FCFCFC' }}>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {content || 'Starting to think...'}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingButton; 