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
  let domain = '';
  let displayDomain = '';
  try {
    const url = new URL(source.url);
    domain = url.hostname;
    displayDomain = domain.replace(/^www\./, '');
  } catch {}
  const faviconUrl = source.favicon || source.icon || (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined);
  const imageUrl = source.image || null;
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
      className={`flex flex-row items-center rounded-xl overflow-hidden transition-all duration-200
        bg-gradient-to-br ${getColorClass()} min-w-[140px] w-[140px] sm:min-w-[180px] sm:w-[180px] h-[80px] shadow-md p-2
        hover:brightness-90 hover:saturate-150`}
    >
      {imageUrl ? (
        <div className="flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden bg-black/20 mr-2 flex items-center justify-center">
          <img
            src={imageUrl}
            alt={source.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-black/30 mr-2 flex items-center justify-center">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-6 h-6 object-contain p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='text-neutral-400'><circle cx='12' cy='12' r='10'></circle><line x1='2' y1='12' x2='22' y2='12'></line></svg>
                `;
              }}
            />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
          )}
        </div>
      )}
      <div className="flex flex-col justify-center min-w-0">
        <span className="text-[11px] font-semibold text-neutral-200 truncate">{displayDomain}</span>
        <span className="text-[13px] font-bold text-white truncate leading-tight" title={source.title}>
          {source.title.length > 30 ? source.title.slice(0, 30) + '…' : source.title}
        </span>
      </div>
    </a>
  );
};

export default WebSourcesCarousel; 