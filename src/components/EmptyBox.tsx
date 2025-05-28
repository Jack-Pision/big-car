import { motion } from 'framer-motion';

interface EmptyBoxProps {
  onClose?: () => void;
}

export default function EmptyBox({ onClose }: EmptyBoxProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative w-full max-w-4xl mx-auto p-6 mb-8 rounded-2xl bg-[#232323] border border-gray-800 min-h-[480px] h-[480px] flex items-start justify-center shadow-lg"
    >
      {/* Empty content area */}
      <div className="flex-1 text-gray-200">
        {/* Content will be added here */}
      </div>
      
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close box"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </motion.div>
  );
} 