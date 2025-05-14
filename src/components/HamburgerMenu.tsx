import { motion } from 'framer-motion';

interface HamburgerMenuProps {
  open: boolean;
  onClick: () => void;
}

export default function HamburgerMenu({ open, onClick }: HamburgerMenuProps) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? 'Close sidebar' : 'Open sidebar'}
      className="p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-black/30 bg-white shadow-md hover:bg-gray-100 transition-colors z-50"
      tabIndex={0}
    >
      <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
      <motion.div
        className="relative w-6 h-6 flex flex-col justify-center items-center"
        initial={false}
        animate={open ? 'open' : 'closed'}
      >
        {/* Top bar */}
        <motion.span
          className="absolute h-0.5 w-6 bg-black rounded"
          variants={{
            closed: { rotate: 0, y: -7 },
            open: { rotate: 45, y: 0 },
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
        {/* Middle bar */}
        <motion.span
          className="absolute h-0.5 w-6 bg-black rounded"
          variants={{
            closed: { opacity: 1, scale: 1 },
            open: { opacity: 0, scale: 0.5 },
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
        {/* Bottom bar */}
        <motion.span
          className="absolute h-0.5 w-6 bg-black rounded"
          variants={{
            closed: { rotate: 0, y: 7 },
            open: { rotate: -45, y: 0 },
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </motion.div>
    </button>
  );
} 