'use client'

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface WebSource {
  title: string;
  url: string;
  icon?: string;
  type?: string;
  description?: string;
}

interface WebSourcesCarouselProps {
  sources: WebSource[];
}

const WebSourcesCarousel: React.FC<WebSourcesCarouselProps> = ({ sources }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  
  if (!sources || sources.length === 0) {
    return null;
  }

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(prev + 1, Math.max(0, sources.length - 3)));
  };

  return (
    <div className="w-full mb-4 relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-neutral-400 text-sm font-medium">Research Sources</h3>
        <div className="flex space-x-2">
          <button 
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`p-1 rounded-full ${currentIndex === 0 ? 'text-neutral-600' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button 
            onClick={handleNext}
            disabled={currentIndex >= sources.length - 3}
            className={`p-1 rounded-full ${currentIndex >= sources.length - 3 ? 'text-neutral-600' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={carouselRef}
        className="overflow-hidden"
      >
        <motion.div 
          className="flex space-x-3"
          animate={{ x: -currentIndex * (carouselRef.current?.offsetWidth ? (carouselRef.current.offsetWidth + 12) / 3 : 280) }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {sources.map((source, i) => (
            <WebSourceCard key={i} source={source} />
          ))}
        </motion.div>
      </div>
    </div>
  );
};

const WebSourceCard: React.FC<{ source: WebSource }> = ({ source }) => {
  // Extract domain for the favicon fallback
  let domain = '';
  try {
    domain = new URL(source.url).hostname;
  } catch {}
  
  // Generate favicon URL (fallback to duckduckgo service if not provided)
  const faviconUrl = source.icon || (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined);
  
  // Determine if we should show a compact card (no image) or full card with image
  const hasImage = source.type === 'news' || source.type === 'article' || source.type === 'video';
  
  // Generate a color based on the domain for variety
  const getColorClass = () => {
    const colors = ['bg-blue-950', 'bg-purple-950', 'bg-emerald-950', 'bg-amber-950', 'bg-rose-950'];
    const sum = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };
  
  return (
    <a 
      href={source.url}
      target="_blank" 
      rel="noopener noreferrer"
      className={`flex flex-col rounded-xl overflow-hidden transition-all hover:ring-2 hover:ring-neutral-500 ${hasImage ? 'w-72 h-48' : 'w-72 h-24'} ${getColorClass()}`}
    >
      {hasImage ? (
        // Full card with image (placeholder shown here)
        <>
          <div className="h-28 bg-neutral-800 w-full flex items-center justify-center overflow-hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
          <div className="p-3 flex flex-col flex-grow">
            <div className="flex items-center mb-1.5">
              {faviconUrl && (
                <div className="w-4 h-4 mr-2 flex-shrink-0">
                  <img 
                    src={faviconUrl} 
                    alt="" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <span className="text-xs text-neutral-400 truncate">{domain}</span>
            </div>
            <h3 className="text-sm text-white font-medium line-clamp-2">{source.title}</h3>
          </div>
        </>
      ) : (
        // Compact card (no image)
        <div className="p-3 flex flex-col h-full justify-center">
          <div className="flex items-center mb-2">
            {faviconUrl && (
              <div className="w-5 h-5 mr-2 flex-shrink-0 bg-neutral-800 rounded-full p-0.5">
                <img 
                  src={faviconUrl} 
                  alt="" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                      </svg>
                    `;
                  }}
                />
              </div>
            )}
            <span className="text-xs text-neutral-400 truncate">{domain}</span>
          </div>
          <h3 className="text-sm text-white font-medium line-clamp-3">{source.title}</h3>
        </div>
      )}
    </a>
  );
};

export default WebSourcesCarousel; 