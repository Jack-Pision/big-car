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
      className="p-2 rounded-md focus:outline-none z-50 bg-transparent"
      tabIndex={0}
    >
      <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
      <span className="flex items-center justify-center w-8 h-8">
        {/* Updated static SVG icon to new menu icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
          <rect x="20" y="20" width="40" height="40" rx="12"/>
          <rect x="80" y="20" width="40" height="40" rx="12"/>
          <rect x="20" y="80" width="40" height="40" rx="12"/>
          <rect x="80" y="80" width="40" height="40" rx="12"/>
        </svg>
      </span>
    </button>
  );
} 