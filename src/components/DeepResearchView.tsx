import React from 'react';
import { motion } from 'framer-motion';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'completed';
}

interface DeepResearchViewProps {
  steps: ThinkingStep[];
  activeStepId: string | null;
  detailedThinking: string;
}

const DeepResearchView: React.FC<DeepResearchViewProps> = ({ 
  steps, 
  activeStepId,
  detailedThinking 
}) => {
  return (
    <div className="grid grid-cols-[300px_1fr] h-full">
      {/* Left sidebar with step list */}
      <div className="border-r border-neutral-800 p-4 flex flex-col">
        <div className="mb-4 px-4 py-2">
          <div className="flex items-center gap-2 text-neutral-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" fill="currentColor"/>
              <ellipse cx="12" cy="12" rx="9" ry="3.5" />
              <ellipse cx="12" cy="12" rx="3.5" ry="9" transform="rotate(60 12 12)" />
              <ellipse cx="12" cy="12" rx="3.5" ry="9" transform="rotate(-60 12 12)" />
            </svg>
            <span className="text-sm font-medium">DeepSearch</span>
          </div>
        </div>
        
        {/* Steps list */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-3 px-4 py-2">
              <div className="mt-1 flex-shrink-0">
                {step.status === 'completed' ? (
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-cyan-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : step.status === 'active' ? (
                  <div className="w-6 h-6 rounded-full border-2 border-cyan-400 flex items-center justify-center animate-pulse">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border border-neutral-700 flex items-center justify-center">
                  </div>
                )}
              </div>
              <div className={`text-sm ${
                step.status === 'completed' ? 'text-neutral-200' : 
                step.status === 'active' ? 'text-cyan-400' : 'text-neutral-500'
              }`}>
                {step.title}
              </div>
            </div>
          ))}
        </div>
        
        {/* Expand/collapse controls */}
        <div className="mt-auto pt-4 flex items-center justify-between px-4">
          <button className="text-neutral-400 hover:text-neutral-200 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button className="text-neutral-400 hover:text-neutral-200 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Right content area with detailed thinking */}
      <div className="p-6 overflow-y-auto">
        <h2 className="text-xl text-neutral-200 mb-4">Thinking</h2>
        
        {activeStepId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-neutral-300 text-sm leading-relaxed"
          >
            {detailedThinking || (
              <div className="flex items-center gap-2 text-neutral-500">
                <div className="w-3 h-3 bg-neutral-700 rounded-full animate-pulse"></div>
                <span>Thinking...</span>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="text-neutral-500 text-sm">
            Waiting to start...
          </div>
        )}
      </div>
    </div>
  );
};

export default DeepResearchView; 