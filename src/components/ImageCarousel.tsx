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

  // Scroll to the current image
  useEffect(() => {
    if (carouselRef.current) {
      const scrollAmount = currentIndex * (240 + 16); // image width + gap
      carouselRef.current.scrollTo({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  }, [currentIndex]);

  return (
    <div className="relative w-full mb-8">
      <h3 className="text-lg font-medium mb-4" style={{ color: '#FCFCFC' }}>Images</h3>
      
      <div className="relative">
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
        
        {/* Carousel container */}
        <div 
          ref={carouselRef}
          className="flex overflow-x-auto scrollbar-hide gap-4 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {images.map((image, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex-shrink-0 cursor-pointer group"
              style={{ width: '240px', height: '160px' }}
              onClick={() => handleImageClick(image.sourceUrl)}
            >
              <div className="w-full h-full rounded-lg overflow-hidden border border-gray-700">
                <img
                  src={image.url}
                  alt={image.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    // Hide broken images
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.classList.add('bg-gray-800');
                    (e.target as HTMLImageElement).parentElement!.innerHTML += `
                      <div class="flex items-center justify-center h-full text-gray-500">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </div>
                    `;
                  }}
                />
              </div>
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ borderBottomLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem' }}
              >
                <p className="text-white text-sm truncate">{image.title}</p>
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* Dots indicator */}
        {images.length > 1 && (
          <div className="flex justify-center mt-4 gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentIndex === index ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageCarousel; 