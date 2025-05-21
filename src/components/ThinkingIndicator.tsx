import { motion } from 'framer-motion';

interface ThinkingIndicatorProps {
  duration: number;  // Duration in milliseconds
}

export default function ThinkingIndicator({ duration }: ThinkingIndicatorProps) {
  const seconds = Math.round(duration / 1000);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.6 }}
      className="text-sm text-gray-500/60 italic mb-2 font-light"
    >
      __ Thoughts for {seconds} seconds __
    </motion.div>
  );
} 