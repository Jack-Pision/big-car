import React from 'react';
import { motion } from 'framer-motion';

interface WebSource {
  id?: string;
  url: string;
  title: string;
  snippet?: string;
  favicon?: string;
}

interface WebSourcesPanelProps {
  sources: WebSource[];
  onSourceClick?: (url: string) => void;
}

const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
};

const WebSourcesPanel: React.FC<WebSourcesPanelProps> = ({ sources, onSourceClick }) => {
  return (
    <div className="space-y-3">
      <div className="border-b border-gray-700 pb-2 mb-3">
        <h2 className="text-xs font-normal text-white">Sources</h2>
      </div>
      
      {sources.map((source, index) => (
        <motion.div
          key={source.id || index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="bg-[#2C2C2E] p-2 border-l border-gray-700 transition-colors"
        >
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            onClick={() => onSourceClick?.(source.url)}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-gray-700 text-xs text-white w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0">
                {index + 1}
              </span>
              {source.favicon && (
                <img src={source.favicon} alt="" className="w-3.5 h-3.5 rounded-full" />
              )}
              <span className="text-[10px] text-gray-400 truncate">
                {extractDomain(source.url)}
              </span>
            </div>
            <h3 className="font-normal text-xs text-white mb-1 hover:text-blue-400 transition-colors line-clamp-2">
              {source.title}
            </h3>
            {source.snippet && (
              <p className="text-[9px] text-gray-300 italic leading-snug line-clamp-1">
                {source.snippet}
              </p>
            )}
          </a>
        </motion.div>
      ))}
    </div>
  );
};

export default WebSourcesPanel; 