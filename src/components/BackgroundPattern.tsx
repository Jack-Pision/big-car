import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Background Connection Lines - Layer 1 */}
      <g className="opacity-20">
        <motion.line x1="10%" y1="15%" x2="25%" y2="8%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 0.2 }} />
        <motion.line x1="25%" y1="8%" x2="45%" y2="12%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 0.8 }} />
        <motion.line x1="45%" y1="12%" x2="65%" y2="18%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 1.4 }} />
        <motion.line x1="5%" y1="25%" x2="20%" y2="35%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 2 }} />
        <motion.line x1="20%" y1="35%" x2="40%" y2="28%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 2.6 }} />
        <motion.line x1="40%" y1="28%" x2="58%" y2="38%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 3.2 }} />
        <motion.line x1="8%" y1="45%" x2="30%" y2="52%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 3.8 }} />
        <motion.line x1="30%" y1="52%" x2="50%" y2="45%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 4.4 }} />
        <motion.line x1="50%" y1="45%" x2="70%" y2="55%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 5 }} />
        <motion.line x1="15%" y1="65%" x2="35%" y2="72%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 5.6 }} />
        <motion.line x1="35%" y1="72%" x2="55%" y2="68%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 6.2 }} />
        <motion.line x1="55%" y1="68%" x2="75%" y2="75%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 6.8 }} />
        <motion.line x1="12%" y1="85%" x2="32%" y2="88%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 7.4 }} />
        <motion.line x1="32%" y1="88%" x2="52%" y2="82%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3, delay: 8 }} />
      </g>
      {/* Background Connection Lines - Layer 2 (Diagonal) */}
      <g className="opacity-15">
        <motion.line x1="15%" y1="20%" x2="35%" y2="45%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 4, delay: 1 }} />
        <motion.line x1="35%" y1="45%" x2="55%" y2="70%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 4, delay: 2 }} />
        <motion.line x1="25%" y1="15%" x2="45%" y2="40%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 4, delay: 3 }} />
        <motion.line x1="45%" y1="40%" x2="65%" y2="65%" stroke="white" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 4, delay: 4 }} />
      </g>
      {/* Background Dots - Main Network */}
      <g>
        <motion.circle cx="20%" cy="10%" r="2" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.7] }} transition={{ duration: 2, delay: 0.5, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="40%" cy="30%" r="2.5" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.6] }} transition={{ duration: 2, delay: 1, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="60%" cy="20%" r="1.8" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.6] }} transition={{ duration: 2, delay: 1.5, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="80%" cy="40%" r="2" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.5] }} transition={{ duration: 2, delay: 2, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="10%" cy="50%" r="1.5" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.4] }} transition={{ duration: 2, delay: 2.5, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="30%" cy="60%" r="2.2" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.6] }} transition={{ duration: 2, delay: 3, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="50%" cy="70%" r="2" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.5] }} transition={{ duration: 2, delay: 3.5, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="70%" cy="80%" r="2.5" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.7] }} transition={{ duration: 2, delay: 4, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="90%" cy="60%" r="1.8" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.4] }} transition={{ duration: 2, delay: 4.5, repeat: Infinity, repeatDelay: 6 }} />
        <motion.circle cx="50%" cy="90%" r="2.3" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }} transition={{ duration: 2, delay: 5, repeat: Infinity, repeatDelay: 6 }} />
      </g>
      {/* Additional Scattered Dots */}
      <g>
        <motion.circle cx="15%" cy="25%" r="1.3" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.4, 0.4] }} transition={{ duration: 1.5, delay: 1, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="35%" cy="15%" r="1.1" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.3, 0.3] }} transition={{ duration: 1.5, delay: 2, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="60%" cy="50%" r="1.5" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.5, 0.5] }} transition={{ duration: 1.5, delay: 3, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="25%" cy="75%" r="1.2" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.4, 0.4] }} transition={{ duration: 1.5, delay: 4, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="80%" cy="30%" r="1.4" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.3, 0.3] }} transition={{ duration: 1.5, delay: 5, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="45%" cy="85%" r="1.6" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.5, 0.5] }} transition={{ duration: 1.5, delay: 6, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="70%" cy="70%" r="1.3" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.4, 0.4] }} transition={{ duration: 1.5, delay: 7, repeat: Infinity, repeatDelay: 8 }} />
        <motion.circle cx="20%" cy="90%" r="1.5" fill="white" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1], opacity: [0, 0.5, 0.5] }} transition={{ duration: 1.5, delay: 8, repeat: Infinity, repeatDelay: 8 }} />
      </g>
      {/* Pulsing Ring Indicators - Background */}
      <g className="opacity-10">
        <motion.circle cx="25%" cy="25%" r="15" fill="none" stroke="white" strokeWidth="1" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 2, 1], opacity: [0, 0.2, 0] }} transition={{ duration: 4, delay: 1, repeat: Infinity }} />
        <motion.circle cx="50%" cy="50%" r="20" fill="none" stroke="white" strokeWidth="1" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 3, 1], opacity: [0, 0.15, 0] }} transition={{ duration: 5, delay: 2, repeat: Infinity }} />
        <motion.circle cx="75%" cy="30%" r="12" fill="none" stroke="white" strokeWidth="1" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 2.2, 1], opacity: [0, 0.18, 0] }} transition={{ duration: 4.5, delay: 3, repeat: Infinity }} />
        <motion.circle cx="60%" cy="70%" r="18" fill="none" stroke="white" strokeWidth="1" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 2.8, 1], opacity: [0, 0.2, 0] }} transition={{ duration: 4, delay: 4, repeat: Infinity }} />
      </g>
    </svg>
  </div>
);

export default BackgroundPattern; 