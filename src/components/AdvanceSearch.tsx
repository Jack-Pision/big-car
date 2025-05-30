import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { ThinkingStep } from '@/hooks/useDeepResearch';

interface AdvanceSearchProps {
  steps: ThinkingStep[];
  activeStepId: string | null;
  error: string | null;
  webData: any | null;
  onManualStepClick?: (stepId: string) => void;
  manualNavigationEnabled?: boolean;
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

const AdvanceSearch: React.FC<AdvanceSearchProps> = ({
  steps,
  activeStepId,
  error,
  webData,
  onManualStepClick,
  manualNavigationEnabled = false
}) => {
  // Create refs for each step section
  const stepRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [displayingSteps, setDisplayingSteps] = useState<string[]>([]);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [expandedSteps, setExpandedSteps] = useState<string[]>([]);

  // Track which steps are being displayed with animation
  useEffect(() => {
    // Add completed steps to the display, in order
    const completedSteps = steps
      .filter(step => step.status === 'completed' || step.status === 'active')
      .map(step => step.id);
    
    // Only add new steps to display if they're not already there
    setDisplayingSteps(prevSteps => {
      const newSteps = [...prevSteps];
      completedSteps.forEach(stepId => {
        if (!newSteps.includes(stepId)) {
          newSteps.push(stepId);
          // Set timeout to scroll to this new step
          setTimeout(() => {
            const element = stepRefs.current[stepId];
            if (element) {
              element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }
          }, 100);
        }
      });
      return newSteps;
    });
  }, [steps]);

  // Function to handle step click and scroll
  const handleStepClick = (stepId: string) => {
    if (manualNavigationEnabled && onManualStepClick) {
      onManualStepClick(stepId);
    }
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

  // Toggle step expansion
  const toggleStep = (stepId: string) => {
    setExpandedSteps((prevSteps: string[]) => {
      if (prevSteps.includes(stepId)) {
        return prevSteps.filter(id => id !== stepId);
      }
      return [...prevSteps, stepId];
    });
  };

  // Helper to render the understand step content
  const renderUnderstandContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return null;
    }

    if (step.status === 'active') {
      if (!step.streamedContent?.length) {
        return null;
      }
      
      return (
        <div className="space-y-4">
          <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-base">
            {step.streamedContent.map((point: string, i: number) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {point}
              </motion.li>
            ))}
          </ul>
        </div>
      );
    }

    // For completed understand step
        return (
      <div className="space-y-4">
        <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-base">
                {(() => {
                  const contentString = typeof step.output === 'string' 
                    ? step.output 
                    : typeof step.content === 'string'
                      ? step.content
                      : '';

            // Process the content to extract only plain, natural sentences
            let plainText = contentString
              .replace(/#{1,6}\s.*/g, '') // Remove all headings
                    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                    .replace(/\*(.*?)\*/g, '$1') // Remove italics
                    .replace(/__(.*?)__/g, '$1') // Remove underline
                    .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
              .replace(/```([\s\S]*?)```/g, '') // Remove code blocks entirely
                    .replace(/`(.*?)`/g, '$1') // Remove inline code
              .replace(/\[[^\]]+\]\([^)]+\)/g, '') // Remove links
              .replace(/!\[[^\]]+\]\([^)]+\)/g, ''); // Remove images
              
            // Split by newlines or bullet markers
            let lines = plainText.split(/\n|[-*•]\s+/)
              .map((line: string) => line.trim())
              .filter((line: string) => line.length > 0);
              
            // Process each line to remove meta-labels and special formatting
            let bulletPoints = lines.map((line: string) => {
              // Remove any meta-labels at start of line (Sub-question:, Research Strategy:, etc.)
              return line.replace(/^([A-Za-z\s]+[:_-]|_[^_]+_|^\d+\.\s*)/i, '').trim();
            })
            .filter((line: string) => {
              // Keep only lines that look like natural sentences
              return line.length > 10 && // Not too short
                     line.length < 200 && // Not too long
                     /[A-Z]/.test(line.charAt(0)) && // Starts with capital letter
                     /[a-zA-Z0-9]/.test(line) && // Contains alphanumeric characters
                     !line.match(/^(Sub-question|Research Strategy|Key Concepts|Information Needed|Objective|Literature Review|Case Study|Comparative Analysis|Expert Interviews|Scenario Planning|Technological Advancements|Sustainability|Note|Example)/i) && // Not a meta-label
                     !line.includes("e.g.,") && // Not an example
                     !line.match(/^_.*_$/) && // Not italic text
                     !line.includes("://"); // Not a URL
            });

            // If no bullet points found, try to split by sentences
            if (bulletPoints.length === 0) {
              bulletPoints = plainText
                .split(/(?<=[.!?])\s+/)
                .map((s: string) => s.trim())
                .filter((s: string) => 
                  s.length > 30 && 
                  s.length < 200 && 
                  /[A-Z]/.test(s.charAt(0)) && // Starts with capital letter
                  !s.match(/^(Sub-question|Research Strategy|Key Concepts|Information Needed|Objective|Literature Review|Case Study|Comparative Analysis|Expert Interviews|Scenario Planning|Technological Advancements|Sustainability|Note|Example)/i) && // Not a meta-label
                  !s.includes("e.g.,") && // Not an example
                  !s.match(/^_.*_$/) // Not italic text
                );
            }

            // If still no points, create default ones
            if (bulletPoints.length === 0) {
              bulletPoints = [
                'Analyzing the key components of your query.',
                'Identifying the main topics and subtopics to research.',
                'Determining the most relevant sources to consult.',
                'Planning a comprehensive search strategy.'
              ];
            }

            // Add periods to the end of sentences if they don't have ending punctuation
            bulletPoints = bulletPoints.map((point: string) => {
              if (!point.match(/[.!?]$/)) {
                return point + '.';
              }
              return point;
            });
            
            // Remove duplicates
            bulletPoints = Array.from(new Set(bulletPoints));
            
            // Ensure we have enough bullet points (but don't duplicate unnecessarily)
            if (bulletPoints.length < 5 && bulletPoints.length > 0) {
              // Only duplicate if we really need to
              bulletPoints.push(...bulletPoints.slice(0, Math.min(2, bulletPoints.length)));
            }

            return bulletPoints.slice(0, 10).map((point: string, i: number) => (
              <li key={i}>{point}</li>
                  ));
                })()}
              </ul>
          </div>
        );
  };

  // Helper to render the research step content
  const renderResearchContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return null;
    }

    if (step.status === 'active') {
      return null;
    }

    // For completed research step, focus on showing the web sources
        return (
      <div className="space-y-4">
        <div className="text-neutral-300 text-base">
          I've gathered relevant information from the following sources:
            </div>
            
            {/* Display detailed web sources with icons and clickable links */}
            {webData && (
          <div className="mt-4 space-y-4">
                {/* Serper (Google) Articles */}
                {webData.serperArticles?.length > 0 && (
              <div className="space-y-2">
                <div className="text-neutral-300 text-base mb-2">Web Articles:</div>
                    <div className="space-y-2">
                  {webData.serperArticles.slice(0, 20).map((article: any, i: number) => {
                        let domain = '';
                        try {
                          domain = new URL(article.url).hostname;
                        } catch {}
                    // Always use DuckDuckGo favicon service for consistency
                    const faviconUrl = domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined;
                        return (
                          <a 
                            key={i} 
                            href={article.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-800/50 transition-colors"
                          >
                            {/* Icon: Always try favicon, fallback to globe only if missing or fails */}
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-neutral-800 rounded-full overflow-hidden">
                              {faviconUrl ? (
                                <img 
                                  src={faviconUrl} 
                                  alt="" 
                                  className="w-4 h-4 object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                                      <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"text-blue-400\">\n                                        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n                                        <line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line>\n                                        <path d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"></path>\n                                      </svg>
                                    `;
                                  }}
                                />
                              ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                              )}
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <div className="text-sm text-cyan-400 truncate hover:underline">
                                {article.title || article.url}
                              </div>
                              <div className="text-xs text-neutral-500 truncate">
                                {(article.url || '').replace(/https?:\/\/(www\.)?/, '').split('/')[0]}
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
                  </div>
                )}
        
        {!webData && (
          <div className="text-neutral-300 text-base">
            <p>No web sources were found for this query. Using internal knowledge instead.</p>
              </div>
            )}
          </div>
        );
  };

  // Helper to render the synthesize step content
  const renderSynthesizeContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return null;
    }

    if (step.status === 'active') {
      return null;
    }

    // For completed synthesize step, only show a status message
    if (step.status === 'completed') {
        return (
        <div className="text-cyan-400 text-base font-medium">
          Response ready! See main chat for the full answer.
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full mx-auto rounded-2xl border border-black/5 shadow-lg bg-neutral-900 overflow-hidden h-full min-h-[400px]" style={{ minHeight: '400px' }}>
      {/* Left Panel - Step List */}
      <div className="w-full md:w-80 md:min-w-[220px] md:max-w-xs flex-shrink-0 bg-neutral-950 p-4 md:p-6 overflow-y-auto md:h-full md:max-h-none md:border-b-0 md:border-r md:border-r-neutral-800 md:rounded-l-2xl h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4 md:mb-6">
          {/* New microchip icon with cyan color */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <rect x="7" y="7" width="10" height="10" rx="2"/>
            <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
            <path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3"/>
          </svg>
          <span className="text-xl text-neutral-200 font-normal">Advance Search</span>
        </div>

        {/* Add conversation mode indicator */}
        {steps[0]?.status === 'active' && steps[0]?.content?.includes('follow-up') && (
          <div className="mb-4 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-cyan-900/20 border border-cyan-800/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="text-xs text-cyan-300">Follow-up question mode</span>
          </div>
        )}

        <div className="flex flex-col relative flex-1">
          {/* Timeline line connecting steps */}
          <div className="absolute left-[10px] top-0 bottom-0 w-px bg-neutral-800"></div>
          
          {/* Step list */}
          {steps.map((step, index) => (
            <div
              key={step.id}
              ref={setStepRef(step.id)}
              className={`relative flex flex-col ${index < steps.length - 1 ? 'mb-6' : ''}`}
            >
              {/* Step timeline dot */}
              <div
                className={`absolute left-0 top-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  step.status === 'completed'
                    ? 'bg-cyan-500 border-cyan-500'
                    : step.status === 'active'
                    ? 'bg-black border-cyan-500'
                    : 'bg-black border-neutral-700'
                }`}
                style={{ zIndex: 1 }}
              >
                {step.status === 'completed' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
              
              {/* Step content */}
              <div
                className={`pl-8 cursor-pointer ${
                  step.status === 'completed' || step.status === 'active'
                    ? 'opacity-100'
                    : 'opacity-40'
                }`}
                onClick={() => {
                  if (step.status === 'completed' || step.status === 'active') {
                    handleStepClick(step.id);
                  }
                }}
              >
                {/* Step title */}
                <div className="mb-1 font-medium text-sm flex items-center gap-2">
                  <span className={step.status === 'completed' ? 'text-cyan-400' : step.status === 'active' ? 'text-cyan-400' : 'text-neutral-400'}>
                {step.title}
                  </span>
                  
                  {/* Show active indicator */}
                  {step.status === 'active' && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                    </div>
                  )}
                </div>
                
                {/* Step description (only show for active/completed) */}
                {(step.status === 'completed' || step.status === 'active') && (
                  <div className="text-xs text-neutral-400">
                    {step.content?.split('\n')[0]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - All Steps Content (Scrollable) */}
      <div ref={rightPanelRef} className="flex-1 overflow-y-auto p-4 md:p-8 bg-neutral-900 md:rounded-r-2xl hide-scrollbar h-full flex flex-col">
        {/* All steps in sequence */}
        <div className="space-y-6 md:space-y-10 flex-1">
          {steps.map((step) => {
            // Only show steps that are in the displayingSteps array
            if (!displayingSteps.includes(step.id)) return null;
            
            return (
            <motion.div
              key={step.id}
              ref={setStepRef(step.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="pb-6 border-b border-neutral-800 last:border-b-0"
            >
              <h2 className="text-xl text-white mb-4">{step.title}</h2>
              
              {/* Step specific content */}
              {step.id === 'understand' && renderUnderstandContent(step)}
              {step.id === 'research' && renderResearchContent(step)}
              {step.id === 'synthesize' && renderSynthesizeContent(step)}
            </motion.div>
            );
          })}
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

export default AdvanceSearch;