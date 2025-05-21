import React from 'react';
import { motion } from 'framer-motion';

interface PulsingDotProps {
  isVisible: boolean;
}

const PulsingDot: React.FC<PulsingDotProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="flex items-center gap-1 p-2">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className="w-2 h-2 rounded-full bg-black/40"
          initial={{ scale: 0.8, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 0.8 }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: "reverse",
            delay: index * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

export default PulsingDot; 