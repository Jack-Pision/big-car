import React from 'react';
import { motion } from 'framer-motion';

interface ThinkingAnimationProps {
  isVisible: boolean;
}

const ThinkingAnimation: React.FC<ThinkingAnimationProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="w-full flex flex-col items-center justify-center py-4">
      <div className="text-sm text-gray-500 mb-2">AI is thinking...</div>
      <div className="flex space-x-2 items-center">
        <motion.div
          className="w-3 h-3 bg-blue-500 rounded-full"
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
          className="w-3 h-3 bg-blue-500 rounded-full"
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
          className="w-3 h-3 bg-blue-500 rounded-full"
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
    </div>
  );
};

export default ThinkingAnimation; 