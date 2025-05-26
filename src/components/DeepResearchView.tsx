import React from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'completed';
  output: any; // Store the actual output of each step
}

interface DeepResearchViewProps {
  steps: ThinkingStep[];
  activeStepId: string | null;
  error: string | null;
  webData: any | null;
}

const DeepResearchView: React.FC<DeepResearchViewProps> = ({ 
  steps, 
  activeStepId,
  error,
  webData
}) => {
  // Get the current active step
  const activeStep = steps.find(step => step.id === activeStepId);
  
  // Helper to render step-specific content
  const renderStepContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return <div className="text-neutral-500">Waiting to start...</div>;
    }

    if (step.status === 'active') {
      return (
        <div className="flex items-center gap-2 text-cyan-400">
          <div className="animate-spin w-4 h-4">⚡</div>
          <span>{step.content}</span>
        </div>
      );
    }

    // For completed steps, show their specific outputs
    switch (step.id) {
      case 'understand':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-neutral-200">Research Plan</h3>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              className="text-neutral-300 text-sm leading-relaxed"
            >
              {step.output || step.content}
            </ReactMarkdown>
          </div>
        );

      case 'research':
        if (!webData) return null;
        // Helper to render a list of articles with icons and links
        const renderArticleList = (articles: any[], icon: string, domainKey: string = 'url') => (
          <ul className="space-y-2">
            {articles.slice(0, 10).map((article: any, i: number) => (
              <li key={i} className="flex items-center gap-2 text-xs text-neutral-300">
                {article.icon && (
                  <img src={article.icon} alt="icon" className="w-4 h-4 inline-block" />
                )}
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {article.title || article.url}
                </a>
                <span className="text-neutral-500 ml-2">{(article.url || '').replace(/https?:\/\/(www\.)?/, '').split('/')[0]}</span>
              </li>
            ))}
          </ul>
        );
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-neutral-200">Related Web Sources</h3>
            {webData.serperArticles.length > 0 && (
              <div className="mb-4">
                {renderArticleList(webData.serperArticles, '/icons/web-icon.svg')}
              </div>
            )}
            {webData.wikipediaArticles.length > 0 && (
              <div className="mb-4">
                {renderArticleList(webData.wikipediaArticles, '/icons/wikipedia-icon.svg')}
              </div>
            )}
            {webData.newsdataArticles.length > 0 && (
              <div className="mb-4">
                {renderArticleList(webData.newsdataArticles, '/icons/newsdata-icon.svg')}
              </div>
            )}
          </div>
        );

      case 'synthesize':
        // Only show the summary/preview (step.output) in the Deep Research UI, not the full answer
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-neutral-200">AI's Thinking Process</h3>
            <p className="text-neutral-400 text-xs mb-4">
              Below is my analysis of the research and what I'll provide in the final answer.
            </p>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              className="text-neutral-300 text-sm leading-relaxed"
            >
              {step.output || step.content}
            </ReactMarkdown>
          </div>
        );

      default:
        return <div className="text-neutral-300">{step.content}</div>;
    }
  };

  return (
    <div className="grid grid-cols-[300px_1fr] h-full" style={{ maxHeight: '600px', overflowY: 'auto' }}>
      {/* Left sidebar with step list */}
      <div className="border-r border-neutral-800 p-4 flex flex-col" style={{ maxHeight: '600px', overflowY: 'auto' }}>
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
        <div className="space-y-1">
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
      </div>
      
      {/* Right content area with step output */}
      <div className="p-6 overflow-y-auto" style={{ maxHeight: '600px' }}>
        {error ? (
          <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
            {error}
          </div>
        ) : activeStep ? (
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {renderStepContent(activeStep)}
          </motion.div>
        ) : (
          <div className="text-neutral-500">
            Select a step to view details...
          </div>
        )}
      </div>
    </div>
  );
};

export default DeepResearchView; 