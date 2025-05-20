'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface AnimatedTextRevealProps {
  text: string;
  className?: string;
  markdownComponents?: any; // Allow passing custom markdown components
}

const AnimatedTextReveal: React.FC<AnimatedTextRevealProps> = ({ text, className, markdownComponents }) => {
  // Split text into sentences. Handles basic punctuation and ensures even non-punctuated last parts are included.
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?:[\"')\]\s]|$)|[^.!?]+$)/g) || [text];
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    // Reset animation when text changes
    setVisibleCount(0);
  }, [text]);

  useEffect(() => {
    if (visibleCount < sentences.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prevCount => prevCount + 1);
      }, 150); // Adjust delay for speed (e.g., 150ms for fast, smooth reveal)
      return () => clearTimeout(timer);
    }
  }, [visibleCount, sentences.length]);

  return (
    <div className={className}>
      {sentences.slice(0, visibleCount).map((sentence, idx) => (
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }} // Short duration for quick reveal
          style={{ display: 'inline-block', marginRight: '0.25em' }} // inline-block to allow transform, margin for spacing
        >
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {sentence.trim()}
          </ReactMarkdown>
        </motion.span>
      ))}
    </div>
  );
};

export default AnimatedTextReveal; 