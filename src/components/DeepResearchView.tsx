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

// Helper function to convert markdown to plain text with bullet points
const convertToPlainText = (markdownText: string): JSX.Element => {
  if (!markdownText) return <></>;
  
  // Split the text into paragraphs
  const paragraphs = markdownText.split(/\n\s*\n/);
  
  return (
    <>
      {paragraphs.map((paragraph, idx) => {
        // Check if this is a bullet list
        if (paragraph.trim().match(/^[-*•]\s/m)) {
          // Split into bullet points
          const bullets = paragraph
            .split(/\n/)
            .filter(line => line.trim().match(/^[-*•]\s/))
            .map(line => line.replace(/^[-*•]\s/, '').trim());
          
          return (
            <div key={idx} className="mb-4">
              <ul className="list-disc pl-5 space-y-2">
                {bullets.map((bullet, bulletIdx) => (
                  <li key={bulletIdx} className="text-neutral-300">{bullet}</li>
                ))}
              </ul>
            </div>
          );
        } 
        // Check if this is a numbered list
        else if (paragraph.trim().match(/^\d+\.\s/m)) {
          // Convert numbered list to bullet points
          const bullets = paragraph
            .split(/\n/)
            .filter(line => line.trim().match(/^\d+\.\s/))
            .map(line => line.replace(/^\d+\.\s/, '').trim());
          
          return (
            <div key={idx} className="mb-4">
              <ul className="list-disc pl-5 space-y-2">
                {bullets.map((bullet, bulletIdx) => (
                  <li key={bulletIdx} className="text-neutral-300">{bullet}</li>
                ))}
              </ul>
            </div>
          );
        }
        // Regular paragraph
        else {
          // Remove any markdown formatting
          const plainText = paragraph
            .replace(/#{1,6}\s/g, '') // Remove headings
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italics
            .replace(/__(.*?)__/g, '$1') // Remove underline
            .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
            .replace(/```([\s\S]*?)```/g, '$1') // Remove code blocks (multi-line safe)
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .trim();
            
          if (plainText.length === 0) return null;
          
          return (
            <p key={idx} className="text-neutral-300 mb-4">
              {plainText}
            </p>
          );
        }
      }).filter(Boolean)}
    </>
  );
};

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
            <div className="text-neutral-300 text-sm leading-relaxed">
              {convertToPlainText(step.output || step.content)}
            </div>
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
    <div className="flex max-w-6xl h-[75vh] w-full mx-auto" style={{ minHeight: '350px' }}>
      {/* Left Panel - Step List */}
      <div className="w-80 min-w-[220px] max-w-xs flex-shrink-0 border-r border-neutral-800 bg-neutral-950 p-6">
        <h2 className="text-xl font-semibold text-neutral-200 mb-6">Deep Research Process</h2>
        <div className="flex flex-col relative">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-start relative min-h-[48px]">
              {/* Vertical line (except last step) */}
              {idx < steps.length - 1 && (
                <span className="absolute left-4 top-6 w-px h-full bg-neutral-700 z-0" style={{ height: '100%' }}></span>
              )}
              {/* Step circle with check if completed */}
              <span className="relative z-10 flex items-center justify-center w-6 h-6 mt-0.5 mr-3">
                <span className={`block w-6 h-6 rounded-full border-2 ${step.status === 'completed' ? 'border-white bg-neutral-800' : 'border-neutral-500 bg-neutral-900'}`}></span>
                {step.status === 'completed' && (
                  <svg className="absolute w-4 h-4 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 10.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {/* Step label */}
              <button
                type="button"
                className={`text-left focus:outline-none bg-transparent border-none p-0 m-0 shadow-none transition-none ${step.id === activeStepId ? 'font-bold text-white' : 'text-neutral-400'}`}
                style={{ fontSize: step.id === activeStepId ? '1.08rem' : '1rem', background: 'none' }}
                onClick={() => handleStepClick(step.id)}
              >
                {step.title}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Step Content (Scrollable) */}
      <div className="flex-1 h-full max-h-[75vh] overflow-y-auto p-8 bg-neutral-900">
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