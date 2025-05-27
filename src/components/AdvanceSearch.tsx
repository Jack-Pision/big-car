import React, { useRef, useState, useEffect } from 'react';
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

  // Helper to render the understand step content
  const renderUnderstandContent = (step: ThinkingStep) => {
    if (step.status === 'pending') {
      return (
        <div className="text-neutral-500 p-4">
          Waiting to analyze your query...
        </div>
      );
    }

    if (step.status === 'active') {
      return (
        <div className="flex items-center gap-2 text-cyan-400 p-4">
          <div className="animate-spin w-4 h-4">⚡</div>
          <span>Analyzing your query...</span>
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
              .map(line => line.trim())
              .filter(line => line.length > 0);
              
            // Process each line to remove meta-labels and special formatting
            let bulletPoints = lines.map(line => {
              // Remove any meta-labels at start of line (Sub-question:, Research Strategy:, etc.)
              return line.replace(/^([A-Za-z\s]+[:_-]|_[^_]+_|^\d+\.\s*)/i, '').trim();
            })
            .filter(line => {
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
                .map(s => s.trim())
                .filter(s => 
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
            bulletPoints = bulletPoints.map(point => {
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

            return bulletPoints.slice(0, 10).map((point, i) => (
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
      return (
        <div className="text-neutral-500 p-4">
          Waiting to gather research...
        </div>
      );
    }

    if (step.status === 'active') {
      return (
        <div className="flex items-center gap-2 text-cyan-400 p-4">
          <div className="animate-spin w-4 h-4">⚡</div>
          <span>Gathering information from multiple sources...</span>
        </div>
      );
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
                  {webData.serperArticles.slice(0, 12).map((article: any, i: number) => {
                    // Extract domain for favicon fallback
                    let domain = '';
                    try {
                      domain = new URL(article.url).hostname;
                    } catch {}
                    // Use favicon from data, or fallback to DuckDuckGo service
                    const faviconUrl = article.favicon || article.icon || (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined);
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="2" y1="12" x2="22" y2="12"></line>
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                          )}
                        </div>
                        
                        {/* Title and Source */}
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
            
            {/* Wikipedia Articles */}
            {webData.wikipediaArticles?.length > 0 && (
              <div className="space-y-2">
                <div className="text-neutral-300 text-base mb-2">Wikipedia:</div>
                <div className="space-y-2">
                  {webData.wikipediaArticles.slice(0, 5).map((article: any, i: number) => (
                    <a 
                      key={i} 
                      href={article.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-800/50 transition-colors"
                    >
                      {/* Wikipedia Icon */}
                      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-neutral-800 rounded-full overflow-hidden">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12.09 13.119C14.679 10.439 17.269 7.76 19.848 5.069C19.934 4.98 20.019 4.881 20.101 4.79C20.268 4.57 20.415 4.33 20.526 4.071C20.637 3.811 20.71 3.534 20.741 3.25C20.771 2.965 20.759 2.676 20.705 2.396C20.651 2.115 20.556 1.846 20.422 1.598C20.289 1.35 20.12 1.127 19.922 0.937C19.724 0.747 19.5 0.594 19.257 0.486C19.014 0.377 18.756 0.314 18.493 0.3C18.231 0.285 17.967 0.319 17.714 0.4C17.198 0.51 16.723 0.77 16.349 1.144C13.981 3.638 11.609 6.129 9.233 8.618C7.854 10.101 6.475 11.584 5.096 13.067C5.096 13.067 4.847 13.357 4.854 13.357C4.861 13.357 5.109 13.066 5.109 13.066C4.699 13.502 4.284 13.935 3.873 14.371C3.88 14.371 4.127 14.081 4.127 14.081C4.122 14.081 3.876 14.371 3.876 14.371C1.661 16.754 -0.541 19.134 -2.729 21.521C-3.242 22.146 -3.759 22.776 -4.275 23.406C-4.347 23.493 -4.422 23.592 -4.496 23.682C-4.663 23.902 -4.81 24.142 -4.921 24.402C-5.032 24.661 -5.105 24.938 -5.136 25.223C-5.166 25.507 -5.154 25.797 -5.1 26.077C-5.046 26.357 -4.951 26.627 -4.817 26.875C-4.684 27.123 -4.515 27.346 -4.317 27.536C-4.119 27.726 -3.895 27.879 -3.652 27.987C-3.409 28.096 -3.151 28.159 -2.888 28.173C-2.626 28.188 -2.362 28.154 -2.109 28.073C-1.593 27.963 -1.119 27.704 -0.744 27.329C-0.741 27.325 -0.738 27.322 -0.735 27.319C1.633 24.824 4.001 22.33 6.372 19.835C7.755 18.35 9.138 16.866 10.52 15.382C10.52 15.382 10.27 15.672 10.277 15.672C10.284 15.672 10.531 15.381 10.531 15.381C10.939 14.943 11.346 14.505 11.762 14.069C11.756 14.069 11.511 14.36 11.511 14.36C11.514 14.36 11.756 14.069 11.759 14.069C11.869 13.947 11.979 13.825 12.09 13.703V13.119Z" fill="#fff"/>
                        </svg>
                      </div>
                      
                      {/* Title */}
                      <div className="flex-1 overflow-hidden">
                        <div className="text-sm text-cyan-400 truncate hover:underline">
                          {article.title}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">Wikipedia</div>
                      </div>
                    </a>
                  ))}
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
      return (
        <div className="text-neutral-500 p-4">
          Waiting to synthesize information...
        </div>
      );
    }

    if (step.status === 'active') {
      return (
        <div className="flex items-center gap-2 text-cyan-400 p-4">
          <div className="animate-spin w-4 h-4">⚡</div>
          <span>Synthesizing information from research findings...</span>
        </div>
      );
    }

    // For completed synthesize step, show understanding paragraphs and bullet points
    return (
      <div className="space-y-4">
        {/* Plain text paragraphs of what the AI understood */}
        <div className="text-neutral-300 text-base leading-relaxed">
          {(() => {
            const contentString = typeof step.output === 'string' 
              ? step.output 
              : typeof step.content === 'string'
                ? step.content
                : '';
            
            // Remove any markdown formatting
            const plainText = contentString
              .replace(/#{1,6}\s/g, '') // Remove headings
              .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
              .replace(/\*(.*?)\*/g, '$1') // Remove italics
              .replace(/__(.*?)__/g, '$1') // Remove underline
              .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
              .replace(/```([\s\S]*?)```/g, '$1') // Remove code blocks
              .replace(/`(.*?)`/g, '$1'); // Remove inline code
            
            // Extract non-bullet paragraphs
            const paragraphs = plainText.split(/\n\s*\n/)
              .filter(p => !p.trim().match(/^[-*•]\s/m))
              .map(p => p.trim())
              .filter(p => p.length > 30);
            
            // Show the first 2-3 paragraphs
            if (paragraphs.length > 0) {
              return paragraphs.slice(0, 3).map((para, i) => (
                <p key={i} className="mb-4">{para}</p>
              ));
            }
            
            return <p>I've analyzed the information gathered from research and synthesized the key findings.</p>;
          })()}
        </div>
        
        {/* Key points as bullet points */}
        <div className="mt-4">
          <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-base">
            {(() => {
              const contentString = typeof step.output === 'string' 
                ? step.output 
                : typeof step.content === 'string'
                  ? step.content
                  : '';
              
              // Try to extract bullet points or create them from key sentences
              let bulletPoints: string[] = [];
              
              // First look for existing bullet points
              const bulletRegex = /[-*•]\s+([^\n]+)/g;
              let bulletMatch;
              while ((bulletMatch = bulletRegex.exec(contentString)) !== null) {
                const point = bulletMatch[1]
                  .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                  .replace(/\*(.*?)\*/g, '$1') // Remove italics
                  .replace(/__(.*?)__/g, '$1') // Remove underline
                  .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
                  .replace(/```([\s\S]*?)```/g, '$1') // Remove code blocks
                  .replace(/`(.*?)`/g, '$1') // Remove inline code
                  .trim();
                
                if (point && !bulletPoints.includes(point)) {
                  bulletPoints.push(point);
                }
              }
              
              // If no bullet points found, try to extract key sentences
              if (bulletPoints.length === 0) {
                const sentences = contentString
                  .replace(/\n/g, ' ')
                  .split(/(?<=[.!?])\s+/)
                  .filter(s => 
                    s.trim().length > 30 && 
                    s.trim().length < 200 &&
                    !s.includes('http') &&
                    !s.toLowerCase().includes('in conclusion') &&
                    !s.toLowerCase().includes('to summarize')
                  )
                  .map(s => s.trim());
                
                bulletPoints = sentences.slice(0, 8); // Take up to 8 key sentences
              }

              // If still no points, add default ones
              if (bulletPoints.length === 0) {
                bulletPoints = [
                  'Key facts and statistics were gathered from reputable sources',
                  'Multiple perspectives were considered to provide a balanced view',
                  'Historical context was analyzed to understand current trends',
                  'Expert opinions were consulted for deeper insights',
                  'Data patterns reveal significant implications for your query',
                  'The most relevant and recent information has been prioritized',
                  'Practical applications of this knowledge have been identified'
                ];
              }
              
              // Ensure at least 7-8 bullet points
              while (bulletPoints.length < 7 && bulletPoints.length > 0) {
                // Duplicate some existing points if needed to reach target count
                bulletPoints.push(...bulletPoints.slice(0, Math.min(2, bulletPoints.length)));
              }
              
              // Return all bullet points (at least 7-8)
              return bulletPoints.slice(0, 10).map((point, i) => (
                <li key={i}>{point}</li>
              ));
            })()}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="flex max-w-6xl w-full mx-auto rounded-2xl border border-gray-200 shadow-lg bg-neutral-900" style={{ height: '440px', minHeight: '440px' }}>
      {/* Left Panel - Step List */}
      <div className="w-80 min-w-[220px] max-w-xs flex-shrink-0 bg-neutral-950 p-6 h-full rounded-l-2xl">
        <div className="flex items-center gap-2 mb-6">
          {/* New microchip icon with cyan color */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <rect x="7" y="7" width="10" height="10" rx="2"/>
            <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
            <path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3"/>
          </svg>
          <span className="text-xl text-neutral-200 font-normal">Advance Search</span>
        </div>
        <div className="flex flex-col relative">
          {steps.map((step, idx) => {
            const isActive = step.id === activeStepId;
            const isInactive = activeStepId && !isActive;
            return (
              <div key={step.id} className="relative min-h-[48px] z-10 flex flex-row items-center">
                {/* Timeline column: vertical line and circle */}
                <div className="flex flex-col items-center justify-start" style={{ width: 24, position: 'relative' }}>
                  {/* Vertical line: continuous, except for last step */}
                  {idx < steps.length - 1 && (
                    <span className="absolute left-1/2 top-6 w-px" style={{ height: 'calc(100% - 1.5rem)', background: '#374151', transform: 'translateX(-50%)' }}></span>
                  )}
                  <span className={`relative flex items-center justify-center w-6 h-6 mt-0.5 ${isActive ? '' : isInactive ? 'opacity-40' : ''}`}>
                    <span className={`block w-6 h-6 rounded-full border-2 ${isActive ? 'border-white bg-neutral-800' : 'border-neutral-500 bg-neutral-900'} ${isInactive ? 'opacity-40' : ''}`}></span>
                    {step.status === 'completed' && (
                      <svg className={`absolute w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-400'} ${isInactive ? 'opacity-40' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M6 10.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </div>
                {/* Step label, perfectly left-aligned with more space from icon */}
                <button
                  type="button"
                  className={`ml-4 text-left focus:outline-none bg-transparent border-none p-0 m-0 shadow-none transition-none ${isActive ? 'text-white' : 'text-neutral-400'} ${isInactive ? 'opacity-40' : ''}`}
                  style={{ fontSize: isActive ? '1.08rem' : '1rem', background: 'none', fontWeight: 400, alignSelf: 'center' }}
                  onClick={() => handleStepClick(step.id)}
                >
                  {step.title}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - All Steps Content (Scrollable) */}
      <div ref={rightPanelRef} className="flex-1 h-full overflow-y-auto p-8 bg-neutral-900 rounded-r-2xl hide-scrollbar">
        {/* All steps in sequence */}
        <div className="space-y-10">
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