import React from 'react';
import { motion } from 'framer-motion';

interface ThinkingAnimationProps {
  isVisible: boolean;
}

const ThinkingAnimation: React.FC<ThinkingAnimationProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="w-full flex flex-col items-center justify-center py-6">
      <div className="text-sm text-gray-600 mb-3">AI is processing your request...</div>
      <div className="flex space-x-3 items-center">
        <motion.div
          className="w-4 h-4 bg-blue-500 rounded-full"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "loop",
            ease: "easeInOut",
            times: [0, 0.5, 1]
          }}
        />
        <motion.div
          className="w-4 h-4 bg-blue-500 rounded-full"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "loop",
            ease: "easeInOut",
            delay: 0.2,
            times: [0, 0.5, 1]
          }}
        />
        <motion.div
          className="w-4 h-4 bg-blue-500 rounded-full"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "loop",
            ease: "easeInOut",
            delay: 0.4,
            times: [0, 0.5, 1]
          }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-3">Only the final result will be shown</div>
    </div>
  );
};

export default ThinkingAnimation; 