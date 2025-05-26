import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'completed';
  output: any;
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
  // Create refs for each step section
  const stepRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Function to handle step click and scroll
  const handleStepClick = (stepId: string) => {
    const element = stepRefs.current[stepId];
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  // Helper function to set ref
  const setStepRef = (stepId: string) => (el: HTMLDivElement | null) => {
    stepRefs.current[stepId] = el;
  };

  // Get the current active step
  const activeStep = steps.find(step => step.id === activeStepId);

  // Helper to render step-specific content
  const renderStepContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return (
        <div className="text-neutral-500 p-4 rounded-lg bg-neutral-900/50">
          Waiting to start...
        </div>
      );
    }

    if (step.status === 'active') {
      return (
        <div className="flex items-center gap-2 text-cyan-400 p-4 rounded-lg bg-neutral-900/50">
          <div className="animate-spin w-4 h-4">⚡</div>
          <span>{step.content}</span>
        </div>
      );
    }

    // For completed steps, show their specific outputs
    switch (step.id) {
      case 'understand':
        return (
          <div className="space-y-4 p-4 rounded-lg bg-neutral-900/50">
            <h3 className="text-lg font-medium text-neutral-200">Understanding the Query</h3>
            <div className="text-neutral-400 text-xs mb-4">
              Here's my analysis of your question and research plan:
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="text-neutral-300 text-sm leading-relaxed"
            >
              {step.output || step.content}
            </ReactMarkdown>
          </div>
        );

      case 'research':
        return (
          <div className="space-y-4 p-4 rounded-lg bg-neutral-900/50">
            <h3 className="text-lg font-medium text-neutral-200">Research Findings</h3>
            <div className="text-neutral-400 text-xs mb-4">
              Here's what I found from searching through available sources:
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="text-neutral-300 text-sm leading-relaxed"
            >
              {step.output || step.content}
            </ReactMarkdown>
            {webData && (
              <div className="mt-4 pt-4 border-t border-neutral-800">
                <h4 className="text-sm font-medium text-neutral-300 mb-2">Sources Found:</h4>
                <ul className="text-xs text-neutral-400 space-y-1">
                  {webData.serperArticles?.length > 0 && (
                    <li>• {webData.serperArticles.length} web articles</li>
                  )}
                  {webData.wikipediaArticles?.length > 0 && (
                    <li>• {webData.wikipediaArticles.length} Wikipedia entries</li>
                  )}
                  {webData.newsdataArticles?.length > 0 && (
                    <li>• {webData.newsdataArticles.length} news articles</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        );

      case 'synthesize':
        return (
          <div className="space-y-4 p-4 rounded-lg bg-neutral-900/50">
            <h3 className="text-lg font-medium text-neutral-200">AI's Thinking Process</h3>
            <div className="text-neutral-400 text-xs mb-4">
              Here's my analysis and plan for the final answer:
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="text-neutral-300 text-sm leading-relaxed"
            >
              {step.output || step.content}
            </ReactMarkdown>
          </div>
        );

      default:
        return (
          <div className="text-neutral-300 p-4 rounded-lg bg-neutral-900/50">
            {step.content}
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-row">
      {/* Left Panel - Step List */}
      <div className="w-72 min-w-[250px] max-w-xs h-full p-4 border-r border-neutral-800 bg-black/80">
        <h2 className="text-xl font-semibold text-neutral-200 mb-4">Deep Research Process</h2>
        <div className="space-y-2">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                step.id === activeStepId
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'hover:bg-neutral-800/50 text-neutral-400'
              }`}
              initial={false}
              animate={{
                backgroundColor:
                  step.id === activeStepId ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
              }}
              onClick={() => handleStepClick(step.id)}
            >
              <div className="flex items-center gap-2">
                {step.status === 'completed' ? (
                  <span className="text-green-500">✓</span>
                ) : step.status === 'active' ? (
                  <span className="animate-spin">⚡</span>
                ) : (
                  <span className="opacity-50">○</span>
                )}
                <span>{step.title}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right Panel - Full Content */}
      <div className="flex-1 h-full overflow-y-auto p-4">
        <div className="space-y-6">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              ref={setStepRef(step.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {renderStepContent(step)}
            </motion.div>
          ))}
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeepResearchView; 