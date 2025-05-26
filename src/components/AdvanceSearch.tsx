import React, { useRef, useEffect, useState } from 'react';
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
            <div className="text-neutral-400 text-xs mb-4">
              Here's what the AI needs to know or focus on:
            </div>
            {step.output && (
              <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-sm">
                {(() => {
                  const contentString = typeof step.output === 'string' 
                    ? step.output 
                    : typeof step.content === 'string'
                      ? step.content
                      : '';
                  // Remove markdown and split into sentences
                  const plainText = contentString
                    .replace(/#{1,6}\s/g, '') // Remove headings
                    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                    .replace(/\*(.*?)\*/g, '$1') // Remove italics
                    .replace(/__(.*?)__/g, '$1') // Remove underline
                    .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
                    .replace(/```([\s\S]*?)```/g, '$1') // Remove code blocks
                    .replace(/`(.*?)`/g, '$1') // Remove inline code
                    .replace(/[-*•]\s+/g, '') // Remove bullet marks
                    .replace(/\n/g, ' ') // Flatten newlines
                    .replace(/\s+/g, ' ') // Remove extra spaces
                    .trim();
                  // Split into sentences
                  let sentences = plainText.split(/(?<=[.!?])\s+/);
                  // Filter out sentences that are just labels, headers, or meta-language
                  sentences = sentences.filter(s => {
                    const lower = s.trim().toLowerCase();
                    // Remove if starts with label or category
                    if (lower.match(/^(objective|literature review|case study|comparative analysis|expert interviews|scenario planning|information needed|key information|technological advancements|sustainability|vehicle models|\d+\.|-|•)/)) return false;
                    // Remove if too short or too long
                    if (s.trim().length < 30 || s.trim().length > 200) return false;
                    // Remove if contains e.g. or similar meta
                    if (lower.includes('e.g.') || lower.includes('for example') || lower.includes('such as')) return false;
                    return true;
                  });
                  // If no good sentences, fallback to a default
                  if (sentences.length === 0) {
                    sentences = ['The AI needs to identify and understand the most relevant information for your query.'];
                  }
                  // Limit to 5 bullet points
                  return sentences.slice(0, 5).map((sentence, i) => (
                    <li key={i} className="text-neutral-300">{sentence.trim()}</li>
                  ));
                })()}
              </ul>
            )}
            {!step.output && (
              <div className="text-neutral-300 text-sm">
                Analyzing your question and research plan...
              </div>
            )}
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
            
            {/* Display detailed web sources with icons and clickable links */}
            {webData && (
              <div className="mt-6 pt-4 border-t border-neutral-800">
                <h4 className="text-sm font-medium text-neutral-300 mb-3">Sources:</h4>
                
                {/* Serper (Google) Articles */}
                {webData.serperArticles?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-neutral-400 mb-2">Web Articles:</div>
                    <div className="space-y-2">
                      {webData.serperArticles.slice(0, 10).map((article: any, i: number) => {
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
                  <div className="mb-4">
                    <div className="text-xs text-neutral-400 mb-2">Wikipedia:</div>
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
          </div>
        );

      case 'synthesize':
        return (
          <div className="space-y-4 p-4 rounded-lg bg-neutral-900/50">
            <h3 className="text-lg font-medium text-neutral-200">Synthesizing Information</h3>
            <div className="text-neutral-400 text-xs mb-4">
              Here's what I understood from the research:
            </div>
            
            {/* Plain text paragraph of what the AI understood */}
            {step.output && (
              <div className="space-y-4">
                {/* Extract and display the summary paragraph */}
                <div className="text-neutral-300 text-sm leading-relaxed">
                  {(() => {
                    // Try to extract the first paragraph for the summary
                    const contentString = typeof step.output === 'string' 
                      ? step.output 
                      : typeof step.content === 'string'
                        ? step.content
                        : '';
                    
                    // Find the first paragraph that's not a bullet point
                    const paragraphs = contentString.split(/\n\s*\n/);
                    const summaryParagraph = paragraphs.find(p => 
                      !p.trim().startsWith('-') && 
                      !p.trim().startsWith('*') && 
                      !p.trim().startsWith('#') &&
                      p.trim().length > 30
                    ) || 'I have synthesized the research findings to answer your question.';
                    
                    // Remove any markdown formatting
                    return summaryParagraph
                      .replace(/#{1,6}\s/g, '') // Remove headings
                      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                      .replace(/\*(.*?)\*/g, '$1') // Remove italics
                      .replace(/__(.*?)__/g, '$1') // Remove underline
                      .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
                      .replace(/```([\s\S]*?)```/g, '$1') // Remove code blocks
                      .replace(/`(.*?)`/g, '$1') // Remove inline code
                      .trim();
                  })()}
                </div>
                
                {/* Key points as bullet points */}
                <div className="mt-6 pt-4 border-t border-neutral-800">
                  <div className="text-neutral-300 text-sm mb-2">Key information highlights:</div>
                  <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-sm">
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
                          .split(/\.\s+/)
                          .filter(s => 
                            s.trim().length > 30 && 
                            s.trim().length < 150 &&
                            !s.includes('http') &&
                            !s.toLowerCase().includes('in conclusion') &&
                            !s.toLowerCase().includes('to summarize')
                          )
                          .map(s => s.trim())
                          .slice(1, 6); // Take up to 5 key sentences
                        
                        bulletPoints = sentences;
                      }
                      
                      // Limit to 5 bullet points max
                      bulletPoints = bulletPoints.slice(0, 5);
                      
                      // If still no points, add a default
                      if (bulletPoints.length === 0) {
                        bulletPoints = ['Information has been synthesized based on the research findings.'];
                      }
                      
                      return bulletPoints.map((point, i) => (
                        <li key={i} className="text-neutral-300">{point}</li>
                      ));
                    })()}
                  </ul>
                </div>
              </div>
            )}
            
            {!step.output && (
              <div className="text-neutral-300 text-sm">
                Synthesizing the information from research findings...
              </div>
            )}
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
        <div className="flex items-center gap-2 mb-6">
          {/* Better chip icon with regular stroke */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><rect x="7" y="7" width="10" height="10" rx="5"/><rect x="2" y="9" width="2" height="6" rx="1"/><rect x="20" y="9" width="2" height="6" rx="1"/><rect x="9" y="2" width="6" height="2" rx="1"/><rect x="9" y="20" width="6" height="2" rx="1"/></svg>
          <span className="text-xl text-neutral-200 font-normal">Advance Search</span>
        </div>
        <div className="relative flex flex-col">
          {/* Vertical line for all steps except last, perfectly centered behind the circles */}
          <div className="absolute top-7 bottom-7 left-0 flex justify-center w-6 z-0">
            <div className="mx-auto w-px h-full bg-neutral-700"></div>
          </div>
          {steps.map((step, idx) => {
            const isActive = step.id === activeStepId;
            return (
              <div key={step.id} className="flex items-start relative min-h-[48px] z-10">
                {/* Step circle with check if completed */}
                <span className="relative flex items-center justify-center w-6 h-6 mt-0.5 mr-3 z-10">
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
                  className={`text-left focus:outline-none bg-transparent border-none p-0 m-0 shadow-none transition-none text-neutral-400 ${isActive ? 'text-cyan-300' : ''} ${activeStepId && !isActive ? 'opacity-40' : ''}`}
                  style={{ fontSize: isActive ? '1.08rem' : '1rem', background: 'none', fontWeight: 400 }}
                  onClick={() => handleStepClick(step.id)}
                >
                  {step.title}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Streaming Output (Scrollable) */}
      <div className="flex-1 h-full max-h-[75vh] overflow-y-auto p-8 bg-neutral-900" id="advance-search-stream-panel">
        <StreamingResearchOutput steps={steps} />
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const StreamingResearchOutput: React.FC<{ steps: ThinkingStep[] }> = ({ steps }) => {
  // Combine all step outputs into a single streaming text (simulate streaming for demo)
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [streamingIndex, setStreamingIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine all completed step outputs into one string
  const allText = steps
    .filter((step) => step.status === 'completed' && step.output)
    .map((step) => (typeof step.output === 'string' ? step.output : ''))
    .join('\n\n');

  // Split into paragraphs (by double newlines or by period)
  const allParagraphs = allText
    .split(/\n\s*\n|(?<=\.)\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Streaming effect: reveal one paragraph at a time
  useEffect(() => {
    if (streamingIndex < allParagraphs.length) {
      const timeout = setTimeout(() => {
        setParagraphs((prev) => [...prev, allParagraphs[streamingIndex]]);
        setStreamingIndex((prev) => prev + 1);
      }, 700); // Adjust speed as needed
      return () => clearTimeout(timeout);
    }
  }, [streamingIndex, allParagraphs.length]);

  // Auto-scroll to bottom as new paragraphs appear
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [paragraphs]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto space-y-6">
      {paragraphs.map((para, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
        >
          <p className="text-neutral-200 text-base leading-relaxed mb-2">{para}</p>
        </motion.div>
      ))}
    </div>
  );
};

export default AdvanceSearch;