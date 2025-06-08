import React from 'react';
import { motion } from 'framer-motion';

const Search: React.FC = () => {
  // Mock steps for UI display only
  const mockSteps = [
    {
      id: 'understand',
      title: 'Understanding your query',
      status: 'completed',
      content: 'Analyzing your search request...'
    },
    {
      id: 'research',
      title: 'Researching information',
      status: 'active',
      content: 'Gathering relevant information...'
    },
    {
      id: 'synthesize',
      title: 'Synthesizing results',
      status: 'pending',
      content: 'Will combine findings into a clear answer...'
    }
  ];

  return (
    <div className="w-full mx-auto rounded-lg overflow-hidden shadow-lg bg-[#171717]" style={{ borderRadius: '20px', maxWidth: '969px' }}>
      {/* Header */}
      <div className="relative flex items-center px-6 py-4 bg-[#171717]" style={{ minHeight: '64px' }}>
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <h1 className="text-lg font-normal text-neutral-200">Search Results</h1>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="#E5E5E5" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </div>
      </div>

      {/* Content panel */}
      <div className="overflow-y-auto px-8 pt-4 pb-2 hide-scrollbar" style={{ maxHeight: '60vh', minHeight: '200px' }}>
        <div className="space-y-8">
          {mockSteps.map((step, idx) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={idx === mockSteps.length - 1 ? "" : "pb-2"}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  step.status === 'completed' 
                    ? 'bg-cyan-500' 
                    : step.status === 'active'
                    ? 'border-2 border-cyan-500'
                    : 'border border-neutral-700'
                }`}>
                  {step.status === 'completed' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  {step.status === 'active' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                  )}
                </div>
                <h2 className="text-xl font-normal text-neutral-200">{step.title}</h2>
              </div>
              
              <div className="text-base text-neutral-300 pl-7">
                {step.status === 'active' && (
                  <div className="flex items-center gap-2 text-cyan-400">
                    <div className="animate-spin">⚡</div>
                    <span>{step.content}</span>
                  </div>
                )}
                {step.status === 'completed' && (
                  <div className="text-neutral-400">{step.content}</div>
                )}
                {step.status === 'pending' && (
                  <div className="text-neutral-500">{step.content}</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Search; 