import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ImageCarouselProps {
  images: Array<{
    url: string;
    title: string;
    sourceUrl: string;
  }>;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState<{ [key: number]: boolean }>({});

  // Skip rendering if no images
  if (!images || images.length === 0) {
    return null;
  }

  const handlePrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? images.length - 1 : prevIndex - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex === images.length - 1 ? 0 : prevIndex + 1));
  };

  const handleImageClick = (sourceUrl: string) => {
    if (sourceUrl) {
      window.open(sourceUrl, '_blank');
    }
  };

  const handleImageLoad = (index: number) => {
    setImageLoaded(prev => ({ ...prev, [index]: true }));
  };

  // Scroll to the current image
  useEffect(() => {
    if (carouselRef.current) {
      const itemWidth = carouselRef.current.offsetWidth;
      const scrollAmount = currentIndex * (itemWidth + 16); // width + gap
      carouselRef.current.scrollTo({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  }, [currentIndex]);

  return (
    <div className="relative w-full mb-8 max-w-full overflow-hidden">
      <div className="relative max-w-full overflow-hidden">
        {/* Navigation buttons */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrevious}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              style={{ left: '-12px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              style={{ right: '-12px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}
        
        {/* Carousel container - images only, no boxes */}
        <div 
          ref={carouselRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 max-w-full snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {images.map((image, index) => (
            <img
              key={index}
              src={image.url}
              alt={image.title}
              style={{ 
                width: '220px',
                height: '146px', // 3:2 aspect ratio
                objectFit: 'cover',
                display: 'block',
                cursor: 'pointer',
                borderRadius: '0.75rem', // rounded-lg
                transition: 'transform 0.3s',
                transform: imageLoaded[index] ? 'scale(1)' : 'scale(0.95)',
                opacity: imageLoaded[index] ? 1 : 0
              }}
              className="group-hover:scale-105"
              onClick={() => handleImageClick(image.sourceUrl)}
                    onLoad={() => handleImageLoad(index)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const container = (e.target as HTMLImageElement).parentElement!;
                      if (!container.querySelector('.error-fallback')) {
                        const fallback = document.createElement('div');
                        fallback.className = 'error-fallback flex items-center justify-center h-full text-gray-500 bg-gray-800/50';
                        fallback.innerHTML = `
                    <div class=\"flex flex-col items-center gap-2\">
                      <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">
                        <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>
                        <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle>
                        <polyline points=\"21 15 16 10 5 21\"></polyline>
                            </svg>
                      <span class=\"text-xs\">Failed to load image</span>
                          </div>
                        `;
                        container.appendChild(fallback);
                      }
                    }}
                  />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImageCarousel; 