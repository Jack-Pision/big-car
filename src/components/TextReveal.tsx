import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface TextRevealProps {
  text: string;
  className?: string;
  markdownComponents?: any;
}

const TextReveal: React.FC<TextRevealProps> = ({ text, className = '', markdownComponents = {} }) => {
  const [chunks, setChunks] = useState<string[]>([]);
  const [visibleChunks, setVisibleChunks] = useState<number>(0);

  useEffect(() => {
    // Split text into paragraphs or chunks
    const textChunks = text
      .split('\n')
      .filter(chunk => chunk.trim() !== '');
    setChunks(textChunks);

    // Reset visibility
    setVisibleChunks(0);

    // Animate chunks appearing
    const timer = setInterval(() => {
      setVisibleChunks(prev => {
        if (prev < textChunks.length) {
          return prev + 1;
        }
        clearInterval(timer);
        return prev;
      });
    }, 100); // Adjust timing as needed

    return () => clearInterval(timer);
  }, [text]);

  return (
    <div 
      className={`text-reveal-container ai-response-text ${className}`}
      style={{ color: '#ffffff' }}
    >
      <AnimatePresence>
        {chunks.slice(0, visibleChunks).map((chunk, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              className="text-white"
            >
              {chunk}
            </ReactMarkdown>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default TextReveal; 