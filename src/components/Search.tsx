'use client';
import React, { useState, useEffect, useRef } from 'react';
import styles from './Search.module.css';
import { dedupedSerperRequest } from '@/utils/api-request-cache';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

// Define step types
type StepStatus = 'pending' | 'active' | 'completed' | 'error';

// Export the SearchStep interface for external use
export interface SearchStep {
  id: string;
  title: string;
  status: StepStatus;
  content: string;
  result?: string;
}

// Define search props interface
export interface SearchProps {
  query: string;
  onComplete?: (result: string) => void;
}

const MAX_STEP1_PROMPT_LENGTH = 1500;

const Search: React.FC<SearchProps> = ({ query, onComplete }) => {
  // State for steps
  const [steps, setSteps] = useState<SearchStep[]>([
    {
      id: 'understand',
      title: 'Query Intelligence & Strategy Planning',
      status: 'pending',
      content: 'Analyzing your query to develop a comprehensive search strategy...'
    },
    {
      id: 'research',
      title: 'Multi-Source Web Discovery & Retrieval',
      status: 'pending',
      content: 'Retrieving relevant information from multiple web sources...'
    },
    {
      id: 'validate',
      title: 'Fact-Checking & Source Validation',
      status: 'pending',
      content: 'Validating the accuracy and reliability of the retrieved information...'
    },
    {
      id: 'analyze',
      title: 'Deep Reasoning & Analysis',
      status: 'pending',
      content: 'Analyzing the validated information to generate insights...'
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<string>('');
  const [firstStepThinking, setFirstStepThinking] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Execute search on mount
  useEffect(() => {
    if (query) {
      executeSearch(query);
    }
  }, [query]);
  
  // Update a step's status
  const updateStepStatus = (id: string, status: StepStatus, result?: string) => {
    setSteps(prevSteps => prevSteps.map(step => {
      if (step.id !== id) return step;
      // Prevent overwriting completed step's result
      if (step.status === 'completed' && step.result) {
        return step;
      }
      return { ...step, status, result: result || step.result };
    }));
  };

  let lastNvidiaCall = 0;
  const NVIDIA_API_DELAY = 2200; // 2.2 seconds

  async function fetchNvidiaWithDelay(url: string, options: RequestInit) {
    const now = Date.now();
    const wait = Math.max(0, NVIDIA_API_DELAY - (now - lastNvidiaCall));
    if (wait > 0) await new Promise(res => setTimeout(res, wait));
    lastNvidiaCall = Date.now();

    let response = await fetch(url, options);
    if (response.status === 429) {
      // Wait longer and retry once
      await new Promise(res => setTimeout(res, 5000));
      response = await fetch(url, options);
    }
    return response;
  }

  // Execute Nvidia API call for a step
  const executeNvidiaStep = async (
    stepId: string, 
    systemPrompt: string, 
    userPrompt: string
  ): Promise<string> => {
    try {
      updateStepStatus(stepId, 'active');
      
      // Make a more concise version of the prompts to reduce token count
      const conciseSystemPrompt = systemPrompt.length > 500 
        ? systemPrompt.substring(0, 500) + "..." 
        : systemPrompt;
      
      const conciseUserPrompt = userPrompt.length > 1000
        ? userPrompt.substring(0, 1000) + "..."
        : userPrompt;
      
      // Add a timeout to avoid hanging on slow responses
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
      
      const response = await fetchNvidiaWithDelay('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: conciseSystemPrompt
            },
            {
              role: 'user',
              content: conciseUserPrompt
            }
          ],
          stream: true,
          max_tokens: 1000 // Increased for more complete stepwise outputs
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || 
          `API call failed with status: ${response.status}`
        );
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }
      
      let result = '';
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  result += content;
                  // Update the step content in real-time
                  updateStepStatus(stepId, 'active', result);
                  // Store the raw thinking for the first step
                  if (stepId === 'understand') {
                    setFirstStepThinking(prevThinking => prevThinking + content);
                  }
                }
              } catch (e) {
                console.error('Error parsing streaming response:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      if (!result) {
        throw new Error('No content received from the API');
      }
      
      // Limit result size for faster processing in next steps
      const finalResult = result.length > 2000 ? result.substring(0, 2000) + "..." : result;
      
      updateStepStatus(stepId, 'completed');
      return finalResult;
    } catch (err) {
      console.error(`Error in ${stepId} step:`, err);
      // If it's an abort error (timeout), provide a special message
      const errorMessage = err instanceof Error 
        ? (err.name === 'AbortError' 
            ? 'This step took too long to complete. Continuing with partial results.'
            : err.message) 
        : String(err);
      
      // Still mark as completed but with an error flag
      updateStepStatus(stepId, 'error', errorMessage);
      
      // Return a partial result instead of failing completely
      return `[Step timed out - proceeding with limited information]`;
    }
  };

  // Execute Serper API call for the research step
  const executeSerperStep = async (query: string): Promise<any> => {
    try {
      updateStepStatus('research', 'active');
      
      // Add a timeout for the Serper API call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Limit to just 5 results for faster processing
      const response = await fetch('/api/serper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          limit: 5, // Reduced from 10 to 5 for faster results
          includeHtml: false // Skip HTML content to reduce payload size
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Search API call failed with status: ${response.status}`);
      }
      
      const serperData = await response.json();
      
      if (!serperData || !serperData.sources || serperData.sources.length === 0) {
        throw new Error('No search results found');
      }
      
      // Limit the source text to reduce payload size in next steps
      const formattedResults = serperData.sources.slice(0, 5).map((source: any, index: number) => 
        `Source ${index + 1}: ${source.title}\nURL: ${source.url}\n`
      ).join('\n');
      
      updateStepStatus('research', 'completed', formattedResults);
      
      // Simplify the result object to reduce memory usage
      return {
        sources: serperData.sources.slice(0, 5).map((source: any) => ({
          title: source.title,
          url: source.url
        }))
      };
    } catch (err) {
      console.error('Error in research step:', err);
      
      // If it's an abort error (timeout), provide a special message
      const errorMessage = err instanceof Error 
        ? (err.name === 'AbortError' 
            ? 'Web search took too long to complete. Continuing with limited results.'
            : err.message) 
        : String(err);
      
      updateStepStatus('research', 'error', errorMessage);
      
      // Return a minimal result object instead of failing completely
      return {
        sources: [
          { title: "Search timed out", url: "" }
        ]
      };
    }
  };
  
  // Helper to extract bullet points from any text (markdown or plain)
  function extractBulletPoints(text: string): string[] {
    if (!text) return [];
    // Extract markdown bullets
    const bulletRegex = /^\s*[-*•]\s+(.*)$/gm;
    let match;
    const bullets: string[] = [];
    while ((match = bulletRegex.exec(text)) !== null) {
      if (match[1]) bullets.push(match[1].trim());
    }
    // If no markdown bullets, split by sentences
    if (bullets.length === 0) {
      // Remove markdown formatting
      const plain = text.replace(/[*_`#>\[\]\(\)]/g, '').replace(/\n+/g, ' ');
      const sentences = plain.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
      return sentences;
    }
    return bullets;
  }

  // Start/stop timer based on step status
  useEffect(() => {
    const allCompleted = steps.every(step => step.status === 'completed');
    if (timerActive && allCompleted) {
      setTimerActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [steps, timerActive]);

  // Timer interval logic
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive]);

  // Reset timer on new search
  useEffect(() => {
    setTimer(0);
    setTimerActive(true);
  }, [query]);

  // Helper to format timer
  function formatTimer(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Utility to extract content inside <think>...</think> tags, or return original if not present
  function extractThinkContent(text: string): string {
    if (!text) return '';
    const match = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return text;
  }

  // Main search execution flow
  const executeSearch = async (query: string) => {
    try {
      setError(null);
      setFirstStepThinking(''); // Reset the first step thinking for new searches
      
      // Shorten the query if it's very long
      const shortenedQuery = query.length > 500 ? query.substring(0, 500) + "..." : query;
      
      // Step 1: Query Intelligence & Strategy Planning - with bullet points and aggressive truncation
      console.time('Step 1: Strategy Planning');
      let step1SystemPrompt = `You are an AI Search Strategy Planner. Show your thinking process. Respond with ONLY a markdown bullet list (one bullet per understanding) and do not include paragraphs or prose.`;
      let step1UserPrompt = `Just show your initial thinking proccess and nothing else.Break down your understanding and thinking about this query in bullet points (one bullet per understanding).\n\nQuery: ${shortenedQuery}`;
      // Aggressively truncate for step 1
      const step1SystemPromptTruncated = step1SystemPrompt.length > MAX_STEP1_PROMPT_LENGTH
        ? step1SystemPrompt.substring(0, MAX_STEP1_PROMPT_LENGTH) + '...'
        : step1SystemPrompt;
      const step1UserPromptTruncated = step1UserPrompt.length > MAX_STEP1_PROMPT_LENGTH
        ? step1UserPrompt.substring(0, MAX_STEP1_PROMPT_LENGTH) + '...'
        : step1UserPrompt;
      console.log('[Nvidia API] Step 1 prompt length:', step1SystemPromptTruncated.length + step1UserPromptTruncated.length);
      const strategyResult = await executeNvidiaStep(
        'understand',
        step1SystemPromptTruncated,
        step1UserPromptTruncated
      );
      console.timeEnd('Step 1: Strategy Planning');
      
      // Step 2: Multi-Source Web Discovery & Retrieval - no change
      console.time('Step 2: Web Discovery');
      const serperResults = await executeSerperStep(shortenedQuery);
      console.timeEnd('Step 2: Web Discovery');
      
      // Step 3: Fact-Checking & Source Validation - with bullet points
      console.time('Step 3: Fact-Checking');
      const validationPrompt = `Show your thinking as you assess the credibility of these search results for: "${shortenedQuery}". Present your thinking as a markdown bullet list (one bullet per understanding) and do not include paragraphs or prose.`;
      const sourcesText = serperResults.sources.map((s: any, i: number) => 
        `${i+1}. ${s.title}: ${s.url}`
      ).join('\n');
      
      const validationResult = await executeNvidiaStep(
        'validate',
        `You are an AI Fact-Checker. Show your thinking process. Respond with ONLY a markdown bullet list (one bullet per understanding) and do not include paragraphs or prose.`,
        `${validationPrompt}\n\nSources:\n${sourcesText}`
      );
      console.timeEnd('Step 3: Fact-Checking');
      
      // Step 4: Deep Reasoning & Analysis - with bullet points
      console.time('Step 4: Deep Reasoning');
      const analysisPrompt = `Show your thinking as you analyze the information for: "${shortenedQuery}". Present your thinking process as a markdown bullet list (one bullet per understanding) and do not include paragraphs or prose.`;
      const analysisResult = await executeNvidiaStep(
        'analyze',
        `You are an AI Analysis Agent. Show your thinking process. Respond with ONLY a markdown bullet list (one bullet per understanding) and do not include paragraphs or prose.`,
        `${analysisPrompt}\n\nStrategy: ${strategyResult}\n\nValidation: ${validationResult}`
      );
      console.timeEnd('Step 4: Deep Reasoning');
      
      // Step 5: Final Output - with streamlined prompt
      console.time('Step 5: Final Output');
      const finalOutputPrompt = `Create a concise, well-structured answer for the query: "${shortenedQuery}"`;
      
      // Add a timeout for the final output
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      try {
        const finalResponse = await fetchNvidiaWithDelay('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are an Answer Generator. Create concise, helpful answers.`
              },
              {
                role: 'user',
                content: `${finalOutputPrompt}\n\nStrategy: ${strategyResult}\n\nFindings: ${validationResult}\n\nAnalysis: ${analysisResult}`
              }
            ],
            stream: true,
            max_tokens: 1000 // Limit tokens for faster response
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!finalResponse.ok) {
          throw new Error(`Final output API call failed with status: ${finalResponse.status}`);
        }
        
        // Handle streaming response for final output
        const reader = finalResponse.body?.getReader();
        if (!reader) {
          throw new Error('No response body available for final output');
        }
        
        let finalOutput = '';
        const decoder = new TextDecoder();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    finalOutput += content;
                    setFinalResult(finalOutput); // Update in real-time
                  }
                } catch (e) {
                  console.error('Error parsing final output streaming response:', e);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        if (!finalOutput) {
          throw new Error('No content received for final output');
        }
        
        // Notify parent component that search is complete with final result
        if (onComplete) {
          onComplete(finalOutput);
        }
        
        console.timeEnd('Step 5: Final Output');
      } catch (err) {
        clearTimeout(timeoutId);
        console.error('Error in final output step:', err);
        
        // If it's a timeout, create a fallback response
        if (err instanceof Error && err.name === 'AbortError') {
          const fallbackOutput = `
# Response for: ${shortenedQuery}

## Key Findings
${analysisResult.split('\n').slice(0, 5).join('\n')}

## Summary
Based on the available information, I can provide a partial answer to your query.
Some steps took longer than expected, but I've compiled the most relevant insights.

*Note: This is a partial response due to processing time constraints.*
`;
          
          setFinalResult(fallbackOutput);
          if (onComplete) {
            onComplete(fallbackOutput);
          }
        } else {
          setError(`Error in search: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
    } catch (err) {
      console.error('Error in search execution:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error in search: ${errorMessage}`);
      
      // Provide a fallback response even if the overall process fails
      const fallbackOutput = `
# Search Results Limited

I encountered an issue while processing your search query.
Please try again with a more specific question, or check back later.

Error details: ${errorMessage}
`;
      
      setFinalResult(fallbackOutput);
      if (onComplete) {
        onComplete(fallbackOutput);
      }
    }
  };

  // Render the Search UI
  return (
    <div
      className="w-full mx-auto rounded-lg overflow-hidden bg-[#171717] border border-white/20"
      style={{ borderRadius: '20px', maxWidth: '969px' }}
    >
      {/* Header (fixed) */}
      <div
        className="relative flex items-center px-6 py-4 bg-[#171717]"
        style={{ minHeight: '64px' }}
      >
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <circle cx="12" cy="12" r="3" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <line x1="14.15" y1="14.15" x2="17" y2="17" />
            <line x1="6.85" y1="17.15" x2="10.15" y2="13.85" />
            <line x1="13.85" y1="10.15" x2="17.15" y2="6.85" />
          </svg>
          <span className="text-lg font-normal text-neutral-200">{query}</span>
          <span className="ml-3 text-xs font-normal text-neutral-400" style={{ minWidth: 44, textAlign: 'center', letterSpacing: 0.5 }}>{formatTimer(timer)}</span>
        </div>
        <motion.div
          className="absolute right-6 top-1/2 -translate-y-1/2 cursor-pointer"
          onClick={() => setIsExpanded((v) => !v)}
          animate={{ rotate: isExpanded ? 0 : 180 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            stroke="#E5E5E5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </motion.div>
      </div>
      {/* Content (scrollable, animated height) */}
      <motion.div
        className={`px-6 py-4 overflow-y-auto ${styles['hide-scrollbar']}`}
        animate={{ height: isExpanded ? 300 : 180 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        style={{ height: 300 - 64 }}
      >
        {/* Steps */}
        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.id} className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3">{step.title}</h3>
              <div className="text-neutral-300 ml-4">
                {step.status !== 'error' && step.result && (
                  (step.id === 'understand' && firstStepThinking) ? (
                    <ReactMarkdown className="prose prose-invert text-neutral-300 text-base">{extractThinkContent(firstStepThinking)}</ReactMarkdown>
                  ) : (step.id !== 'research') ? (
                    <ul className="list-disc pl-5 space-y-2 text-neutral-300 text-base">
                      {extractBulletPoints(extractThinkContent(step.result)).map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{step.result}</p>
                  )
                )}
                {step.status !== 'error' && !step.result && step.content && <p>{step.content}</p>}
                {step.status === 'error' && <p className="text-red-400">An error occurred while processing this step.</p>}
              </div>
            </div>
          ))}
        </div>
        {/* Error display */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Search; 