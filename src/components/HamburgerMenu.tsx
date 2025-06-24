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
      <span className="flex items-center justify-center w-6 h-6">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" height="24" width="24">
          <desc>
            Columns 2 Streamline Icon: https://streamlinehq.com
          </desc>
          <path d="M3 4a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1H4a1 1 0 0 1 -1 -1zm9 -1v18" strokeWidth="2"></path>
        </svg>
      </span>
    </button>
  );
} 