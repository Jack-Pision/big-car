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
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium text-neutral-300">Sources:</h4>
                  {/* Web Results Counter */}
                  <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-1 rounded-full">
                    {webData.totalWebResults || webData.serperArticles?.length || 0} results
                  </span>
                </div>
                
                {/* Serper (Google) Articles */}
                {webData.serperArticles?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-neutral-400 mb-2">Web Articles:</div>
                    <div className="space-y-2">
                      {webData.serperArticles.map((article: any, i: number) => {
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
              </div>
            )}
          </div>
        );

      case 'synthesize':
        return (
          <div className="space-y-4 p-4 rounded-lg bg-neutral-900/50">
            {step.output && (
              <div className="text-neutral-300 text-base leading-relaxed">
                {(() => {
                  const contentString = typeof step.output === 'string' 
                    ? step.output 
                    : typeof step.content === 'string'
                      ? step.content
                      : '';
                  
                  // Process the answer to make citations clickable
                  const processedContent = contentString
                    // Convert citation format: [@Web](URL) to <a href="URL" target="_blank" class="...">[@Web]</a>
                    .replace(/\[@([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 text-xs hover:bg-blue-800/40 transition-colors">[@$1]</a>');
                  
                  // Use dangerouslySetInnerHTML to render the HTML with clickable citations
                  return (
                    <div 
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: processedContent }}
                    />
                  );
                })()}
              </div>
            )}
            
            {!step.output && (
              <div className="text-neutral-300 text-sm">
                <p>Analysis in progress...</p>
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
          {/* Chip icon with regular stroke */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><rect x="4" y="7" width="16" height="10" rx="5"/><path d="M8 7V5m8 2V5M8 19v-2m8 2v-2"/></svg>
          <span className="text-xl text-neutral-200 font-normal">Advance Search</span>
        </div>
        <div className="flex flex-col relative">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-start relative min-h-[40px]">
              {/* Vertical line (except last step) */}
              {idx < steps.length - 1 && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 top-5 w-px h-full bg-neutral-700 z-0"
                  style={{ height: '100%' }}
                ></span>
              )}
              {/* Step circle with check if completed */}
              <span className="relative z-10 flex items-center justify-center w-4 h-4 mt-0.5 mr-2">
                <span className={`block w-4 h-4 rounded-full border-2 ${step.status === 'completed' ? 'border-white bg-neutral-800' : 'border-neutral-500 bg-neutral-900'}`}></span>
                {step.status === 'completed' && (
                  <svg className="absolute w-3 h-3 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 10.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {/* Step label */}
              <button
                type="button"
                className={`text-left focus:outline-none bg-transparent border-none p-0 m-0 shadow-none transition-none ${step.id === activeStepId ? 'text-white' : 'text-neutral-400 opacity-70'}`}
                style={{ fontSize: step.id === activeStepId ? '0.98rem' : '0.88rem', background: 'none', fontWeight: 400, lineHeight: 1.1 }}
                onClick={() => handleStepClick(step.id)}
              >
                {step.title}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Step Content (Scrollable) */}
      <div className="flex-1 h-full max-h-[75vh] overflow-y-auto p-8 bg-neutral-900 hide-scrollbar">
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

export default AdvanceSearch;