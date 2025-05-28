'use client'

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface WebSource {
  title: string;
  url: string;
  icon?: string;
  type?: string;
  description?: string;
  favicon?: string;
  image?: string;
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

  const visibleItems = window?.innerWidth >= 768 ? 3 : 2;
  
  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(prev + 1, Math.max(0, sources.length - visibleItems)));
  };

  return (
    <div className="w-full mb-6 relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-neutral-300 text-sm font-medium">Research Sources</h3>
        <div className="flex space-x-2">
          <button 
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`p-1.5 rounded-full ${currentIndex === 0 ? 'text-neutral-600' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            aria-label="Previous"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button 
            onClick={handleNext}
            disabled={currentIndex >= sources.length - visibleItems}
            className={`p-1.5 rounded-full ${currentIndex >= sources.length - visibleItems ? 'text-neutral-600' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            aria-label="Next"
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
          className="flex gap-3"
          animate={{ 
            x: -currentIndex * (carouselRef.current?.offsetWidth 
              ? (carouselRef.current.offsetWidth + 12) / visibleItems 
              : 320) 
          }}
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
  let displayDomain = '';
  
  try {
    const url = new URL(source.url);
    domain = url.hostname;
    displayDomain = domain.replace(/^www\./, '');
  } catch {}
  
  // Generate favicon URL (fallback to duckduckgo service if not provided)
  const faviconUrl = source.favicon || source.icon || (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined);
  
  // Determine if there's an image available
  const imageUrl = source.image || null;
  
  // Generate a color based on the domain for variety
  const getColorClass = () => {
    const colors = [
      'from-blue-900 to-blue-950', 
      'from-purple-900 to-purple-950', 
      'from-emerald-900 to-emerald-950', 
      'from-amber-900 to-amber-950', 
      'from-rose-900 to-rose-950'
    ];
    const sum = domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };
  
  return (
    <a 
      href={source.url}
      target="_blank" 
      rel="noopener noreferrer"
      className={`flex flex-col rounded-xl overflow-hidden transition-all
        hover:ring-2 hover:ring-neutral-500 bg-gradient-to-br ${getColorClass()}
        min-w-[280px] w-[calc(33.33%-8px)] sm:min-w-[300px] h-52 shadow-md`}
    >
      {imageUrl ? (
        // Card with actual image
        <>
          <div className="h-32 w-full flex items-center justify-center overflow-hidden">
            <img 
              src={imageUrl} 
              alt={source.title} 
              className="w-full h-full object-cover"
              onError={(e) => {
                // If image fails, replace with placeholder
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNzA3MDcwIiBzdHJva2Utd2lkdGg9IjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSI+PC9jaXJjbGU+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSI+PC9wb2x5bGluZT48L3N2Zz4=';
                (e.target as HTMLImageElement).className = 'w-24 h-24 object-contain opacity-20';
              }}
            />
          </div>
          <div className="p-3 flex flex-col flex-grow">
            <div className="flex items-center mb-1.5">
              {faviconUrl && (
                <div className="w-5 h-5 mr-2 flex-shrink-0 bg-black bg-opacity-30 rounded-full p-0.5 flex items-center justify-center">
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
              <span className="text-xs text-neutral-200 truncate font-medium">{displayDomain}</span>
            </div>
            <h3 className="text-sm text-white font-medium line-clamp-2">{source.title}</h3>
          </div>
        </>
      ) : (
        // Card with no image, larger icon and title layout
        <div className="p-4 flex flex-col h-full justify-center">
          <div className="flex items-center mb-3">
            {faviconUrl && (
              <div className="w-12 h-12 mr-3 flex-shrink-0 bg-black bg-opacity-30 rounded-full p-1.5 flex items-center justify-center">
                <img 
                  src={faviconUrl} 
                  alt="" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-300">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                      </svg>
                    `;
                  }}
                />
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs text-neutral-300 font-medium mb-1">{displayDomain}</span>
              <h3 className="text-base text-white font-semibold line-clamp-3">{source.title}</h3>
            </div>
          </div>
        </div>
      )}
    </a>
  );
};

export default WebSourcesCarousel; 