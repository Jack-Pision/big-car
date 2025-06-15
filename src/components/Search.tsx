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

const MAX_STEP1_PROMPT_LENGTH = 3000; // Increased for enhanced prompts

const Search: React.FC<SearchProps> = ({ query, onComplete }) => {
  // State for steps
  const [steps, setSteps] = useState<SearchStep[]>([
    {
      id: 'understand',
      title: 'AI Search Strategy Planner',
      status: 'pending',
      content: 'Conducting comprehensive query analysis and developing optimized search strategies...'
    },
    {
      id: 'research',
      title: 'Multi-Source Web Discovery & Retrieval',
      status: 'pending',
      content: 'Retrieving relevant information from multiple web sources...'
    },
    {
      id: 'validate',
      title: 'AI Fact-Checker & Source Validator',
      status: 'pending',
      content: 'Evaluating source credibility, bias indicators, and information reliability...'
    },
    {
      id: 'analyze',
      title: 'AI Information Synthesis Analyst',
      status: 'pending',
      content: 'Synthesizing validated information and identifying key patterns and insights...'
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<string>('');
  const [firstStepThinking, setFirstStepThinking] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  
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
      
      // Debug logging for research step
      if (id === 'research') {
        console.log(`[DEBUG] Updating research step: ${step.status} -> ${status}`, {
          hasExistingResult: !!step.result,
          newResult: !!result,
          resultPreview: result?.substring(0, 100)
        });
      }
      
      // Allow updating if we're providing new results, even if already completed
      if (result) {
        return { ...step, status, result };
      }
      
      // Prevent overwriting completed step's result only if no new result is provided
      if (step.status === 'completed' && step.result && !result) {
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
          max_tokens: 4096 // Increased for more complete stepwise outputs
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
      
      // Step 1: AI Search Strategy Planner - Enhanced prompt system
      console.time('Step 1: AI Search Strategy Planner');
      let step1SystemPrompt = `You are an AI Search Strategy Planner specializing in query analysis and search optimization. Your role is to deconstruct user queries and develop comprehensive search strategies.

RESPONSE FORMAT: Respond ONLY with a markdown bullet list. Each bullet point must represent one distinct understanding or strategic insight. Do not include paragraphs, prose, or explanations outside the bullet format.

ANALYSIS DEPTH: Consider query intent, keyword variations, potential ambiguities, search scope, information types needed, and optimal search approaches.`;
      let step1UserPrompt = `Analyze this query and develop your search strategy thinking process. Break down your understanding into bullet points (one insight per bullet).

Query: ${shortenedQuery}

Focus on:
- Query intent and context
- Key concepts and terms
- Potential search angles
- Information gaps to address
- Search optimization strategies`;
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
      console.timeEnd('Step 1: AI Search Strategy Planner');
      
      // Step 2: Multi-Source Web Discovery & Retrieval - no change
      console.time('Step 2: Web Discovery');
      const serperResults = await executeSerperStep(shortenedQuery);
      console.timeEnd('Step 2: Web Discovery');
      
      // Step 3: AI Fact-Checker & Source Validator - Enhanced validation system
      console.time('Step 3: AI Fact-Checker & Source Validator');
      const sourcesText = serperResults.sources.map((s: any, i: number) => 
        `${i+1}. ${s.title}: ${s.url}`
      ).join('\n');
      
      const validationResult = await executeNvidiaStep(
        'validate',
        `You are an AI Fact-Checker and Source Validation Specialist. Your expertise lies in evaluating source credibility, identifying bias, and assessing information reliability.

RESPONSE FORMAT: Respond ONLY with a markdown bullet list. Each bullet represents one distinct credibility assessment or validation insight.

EVALUATION CRITERIA: Assess source authority, publication date relevance, bias indicators, corroboration across sources, methodology quality, and potential conflicts of interest.`,
        `Evaluate the credibility and reliability of these sources for the query: "${shortenedQuery}"

Present your credibility assessment as bullet points (one evaluation insight per bullet).

Sources:
${sourcesText}

Consider:
- Source authority and expertise
- Publication recency and relevance
- Bias and objectivity indicators
- Cross-source corroboration
- Methodological rigor
- Potential red flags or limitations`
      );
      console.timeEnd('Step 3: AI Fact-Checker & Source Validator');
      
      // Step 4: AI Information Synthesis Analyst - Enhanced synthesis system
      console.time('Step 4: AI Information Synthesis Analyst');
      const analysisResult = await executeNvidiaStep(
        'analyze',
        `You are an AI Information Synthesis Analyst. You excel at analyzing complex information, identifying patterns, and synthesizing insights from multiple validated sources.

RESPONSE FORMAT: Respond ONLY with a markdown bullet list. Each bullet represents one distinct analytical insight or synthesis point.

SYNTHESIS APPROACH: Integrate findings from strategy and validation phases, identify key themes, resolve contradictions, highlight gaps, and extract actionable insights.`,
        `Synthesize and analyze the information for: "${shortenedQuery}"

Present your analytical thinking as bullet points (one synthesis insight per bullet).

Search Strategy Results: ${strategyResult}
Source Validation Results: ${validationResult}
Raw Information: ${JSON.stringify(serperResults).substring(0, 1000)}

Focus on:
- Key findings and patterns
- Information quality and consistency
- Contradictions or gaps
- Confidence levels in different claims
- Actionable insights and implications`
      );
      console.timeEnd('Step 4: AI Information Synthesis Analyst');
      
      // Step 5: AI Research Paper Generator - Enhanced comprehensive output
      console.time('Step 5: AI Research Paper Generator');
      
      // Add a timeout for the final output (increased for comprehensive papers)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for research papers
      
      try {
        const finalResponse = await fetchNvidiaWithDelay('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are an AI Research Paper Generator specializing in comprehensive academic and professional research synthesis. You create well-structured, thoroughly researched papers with proper citations and scholarly formatting.

REQUIREMENTS:
- Minimum 700 words (aim for 1000-1500 for complex topics)
- Structured markdown format with clear hierarchy
- Proper citations for all claims and data points
- Academic tone with accessible language
- Evidence-based arguments and conclusions

STRUCTURE TEMPLATE:
- Executive Summary
- Introduction with context and objectives
- Methodology (search and analysis approach)
- Findings (organized thematically)
- Discussion and Analysis
- Limitations and Future Research
- Conclusion
- References

CITATION FORMAT: Use inline citations [Source Name, Year] and include full reference list. Ensure every factual claim is properly attributed.`
              },
              {
                role: 'user',
                content: `Generate a comprehensive research paper on: "${shortenedQuery}"

Use the following inputs to create your paper:

**Search Strategy:** ${strategyResult}
**Source Validation:** ${validationResult}  
**Synthesized Analysis:** ${analysisResult}
**Primary Sources:** ${serperResults.sources.map((s: any, i: number) => `${i+1}. ${s.title} - ${s.url}`).join('\n')}

**Paper Requirements:**
- Minimum 700 words (target 1000-1500)
- Academic structure with clear sections
- Citations for all factual claims
- Balanced analysis of multiple perspectives
- Clear conclusions based on evidence
- Professional markdown formatting

**Focus Areas:** Provide comprehensive coverage of the topic with evidence-based insights and actionable conclusions.`
              }
            ],
            stream: true,
            max_tokens: 8192 // Increased for comprehensive research papers
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
        
        console.timeEnd('Step 5: AI Research Paper Generator');
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
      className="w-full mx-auto rounded-lg overflow-hidden bg-gray-800 relative"
      style={{ 
        borderRadius: '20px', 
        maxWidth: '969px'
      }}
    >
      {/* Header (fixed) */}
      <div
        className="relative flex items-center px-6 py-4 bg-gray-800"
        style={{ minHeight: '64px' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 relative flex-shrink-0">
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 32 32" 
              fill="#06b6d4"
            >
              <path d="M10.799 4.652c-1.485 0.324-2.271 2.045-2.104 4.593 0.051 0.738 0.043 0.666 0.196 1.609 0.064 0.38 0.107 0.7 0.098 0.709-0.008 0.013-0.269 0.077-0.572 0.149-2.019 0.465-3.505 1.165-4.397 2.070-0.602 0.606-0.854 1.17-0.845 1.882 0.004 0.401 0.137 0.841 0.38 1.264 0.209 0.363 0.956 1.101 1.447 1.434 1.029 0.692 1.345 0.79 1.626 0.508 0.12-0.119 0.145-0.179 0.145-0.32 0-0.273-0.094-0.405-0.414-0.581-1.409-0.781-2.147-1.592-2.147-2.369 0-0.282 0.098-0.538 0.333-0.845 0.619-0.824 2.113-1.562 4.115-2.036 0.529-0.124 0.632-0.132 0.632-0.043 0 0.115 0.427 1.481 0.7 2.228l0.273 0.751-0.337 0.645c-0.184 0.354-0.448 0.892-0.585 1.2-1.959 4.316-2.284 7.743-0.867 9.152 0.333 0.333 0.606 0.487 1.054 0.602 1.033 0.265 2.399-0.132 3.931-1.144 0.534-0.354 0.653-0.487 0.653-0.721 0-0.282-0.307-0.555-0.581-0.512-0.077 0.013-0.376 0.179-0.662 0.367-0.632 0.422-1.34 0.773-1.853 0.926-0.525 0.154-1.093 0.162-1.417 0.021-0.995-0.44-1.225-2.215-0.606-4.678 0.29-1.17 0.956-2.928 1.558-4.128l0.239-0.482 0.132 0.299c0.248 0.572 1.212 2.437 1.588 3.073 2.079 3.534 4.422 6.125 6.501 7.184 1.473 0.751 2.689 0.683 3.517-0.201 0.61-0.645 0.909-1.584 0.96-2.992 0.081-2.425-0.709-5.579-2.254-8.96-0.205-0.453-0.41-0.862-0.448-0.905-0.094-0.102-0.333-0.171-0.495-0.137s-0.359 0.231-0.388 0.397c-0.034 0.158 0.004 0.265 0.384 1.088 1.059 2.284 1.801 4.683 2.087 6.744 0.094 0.679 0.111 2.151 0.026 2.604-0.085 0.457-0.252 0.931-0.431 1.204-0.286 0.44-0.615 0.619-1.157 0.615-1.609-0.004-4.145-2.215-6.399-5.571-1.037-1.55-1.993-3.3-2.732-5.011l-0.265-0.61 0.371-0.627c0.478-0.811 0.982-1.579 1.545-2.369l0.448-0.627h0.692c4.747 0 9.459 1.076 11.867 2.702 0.551 0.371 1.080 0.914 1.264 1.289 0.128 0.265 0.145 0.337 0.145 0.64-0.004 0.286-0.021 0.376-0.119 0.563-0.294 0.572-1.042 1.14-2.079 1.592-0.487 0.209-0.64 0.354-0.64 0.602 0 0.23 0.094 0.397 0.273 0.482 0.196 0.094 0.265 0.085 0.581-0.043 1.49-0.602 2.565-1.49 2.903-2.395 0.623-1.665-0.683-3.347-3.564-4.602-2.518-1.101-6.219-1.789-10.070-1.87l-0.423-0.009 0.482-0.555c0.555-0.645 1.78-1.87 2.305-2.309 1.246-1.050 2.361-1.716 3.321-1.989 0.474-0.137 1.059-0.132 1.362 0.004 0.41 0.184 0.696 0.598 0.854 1.238 0.098 0.388 0.098 1.575 0 2.147-0.111 0.632-0.098 0.743 0.073 0.913 0.124 0.124 0.175 0.145 0.354 0.145 0.38 0 0.478-0.141 0.593-0.832 0.060-0.354 0.081-0.692 0.081-1.387 0-0.811-0.013-0.965-0.098-1.302-0.269-1.063-0.926-1.797-1.806-2.006-2.040-0.478-5.161 1.485-8.264 5.208-0.256 0.303-0.495 0.602-0.534 0.653-0.064 0.094-0.107 0.102-0.726 0.141-0.359 0.021-1.016 0.081-1.464 0.132-1.187 0.137-1.093 0.149-1.161-0.158-0.179-0.858-0.239-1.46-0.243-2.39-0.004-1.007 0.030-1.306 0.213-1.865 0.196-0.593 0.529-0.995 0.952-1.135 0.205-0.073 0.709-0.064 1.007 0.013 0.499 0.132 1.204 0.508 1.844 0.99 0.38 0.286 0.512 0.337 0.713 0.269 0.23-0.073 0.367-0.265 0.367-0.504 0-0.179-0.017-0.213-0.205-0.393-0.265-0.256-1.033-0.768-1.498-0.999-0.879-0.44-1.648-0.581-2.339-0.431zM12.4 12.216c-0.004 0.021-0.282 0.44-0.61 0.935s-0.653 0.995-0.721 1.11l-0.124 0.209-0.102-0.277c-0.128-0.337-0.525-1.643-0.525-1.725 0-0.077 0.188-0.107 1.579-0.252 0.29-0.030 0.521-0.030 0.504 0zM15.649 14.854c-0.303 0.098-0.598 0.316-0.773 0.576-0.525 0.773-0.269 1.78 0.555 2.185 0.256 0.128 0.32 0.141 0.67 0.141s0.414-0.013 0.67-0.141c1.114-0.546 1.089-2.168-0.043-2.689-0.299-0.137-0.781-0.166-1.080-0.073z"/>
            </svg>
          </div>
          <span className="text-base font-normal text-cyan-400">{query}</span>
        </div>
        
        {/* Expand/Collapse Arrow Button */}
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
        <div className="space-y-6">
          {steps.map((step, idx) => (
            <div key={step.id} className="mb-4">
              <h3 className={`text-base font-medium mb-2 ${
                step.status === 'active' 
                ? styles['step-title-active']
                : step.status === 'completed'
                ? styles['step-title-completed']
                : styles['step-title']
              }`}>{step.title}</h3>
              <div className="text-neutral-300 ml-4">
                {step.status !== 'error' && step.result && (
                  (step.id === 'understand' && firstStepThinking) ? (
                    <p className="text-neutral-300 text-sm whitespace-pre-wrap">{extractThinkContent(firstStepThinking)}</p>
                  ) : (step.id === 'research') ? (
                    // Custom rendering for research step with branded chips

                    <div className="flex flex-wrap gap-2 mt-2">
                      {step.result.split('\n').filter(line => line.startsWith('Source')).map((sourceLine, i) => {
                        const urlMatch = sourceLine.match(/URL: (.+)/);
                        const titleMatch = sourceLine.match(/Source \d+: (.+)/);
                        
                        if (urlMatch && titleMatch) {
                          const url = urlMatch[1];
                          const title = titleMatch[1].replace(/\nURL:.*/, '').trim();
                          
                          // Extract domain and get styling
                          let domainInfo = { name: 'unknown', icon: '🌐', bgColor: 'bg-gray-600', textColor: 'text-white' };
                          try {
                            const domain = new URL(url).hostname.replace('www.', '');
                            const domainName = domain.split('.')[0];
                            
                            const domainStyles: { [key: string]: { icon: string; bgColor: string; textColor: string } } = {
                              'google': { icon: '🔍', bgColor: 'bg-blue-600', textColor: 'text-white' },
                              'wikipedia': { icon: '📚', bgColor: 'bg-gray-700', textColor: 'text-white' },
                              'github': { icon: '⚡', bgColor: 'bg-gray-800', textColor: 'text-white' },
                              'stackoverflow': { icon: '💡', bgColor: 'bg-orange-600', textColor: 'text-white' },
                              'reddit': { icon: '🔥', bgColor: 'bg-orange-500', textColor: 'text-white' },
                              'medium': { icon: '✍️', bgColor: 'bg-green-600', textColor: 'text-white' },
                              'youtube': { icon: '📺', bgColor: 'bg-red-600', textColor: 'text-white' },
                              'twitter': { icon: '🐦', bgColor: 'bg-blue-500', textColor: 'text-white' },
                              'linkedin': { icon: '💼', bgColor: 'bg-blue-700', textColor: 'text-white' },
                              'zebpay': { icon: '⚡', bgColor: 'bg-blue-600', textColor: 'text-white' },
                              'explodingtopics': { icon: '💥', bgColor: 'bg-purple-600', textColor: 'text-white' },
                              'a16z': { icon: '🚀', bgColor: 'bg-green-600', textColor: 'text-white' },
                              'franklin': { icon: '➕', bgColor: 'bg-gray-700', textColor: 'text-white' },
                              'bitpanda': { icon: '🐼', bgColor: 'bg-purple-700', textColor: 'text-white' },
                            };

                            for (const [key, style] of Object.entries(domainStyles)) {
                              if (domainName.includes(key) || domain.includes(key)) {
                                domainInfo = { name: domainName, ...style };
                                break;
                              }
                            }
                            
                            if (domainInfo.name === 'unknown') {
                              domainInfo = { name: domainName, icon: '🌐', bgColor: 'bg-cyan-600', textColor: 'text-white' };
                            }
                          } catch {
                            // Keep default values
                          }
                          
                          return (
                            <div
                              key={i}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 cursor-pointer ${domainInfo.bgColor} ${domainInfo.textColor}`}
                              onClick={() => window.open(url, '_blank')}
                              title={title}
                            >
                              <span className="text-base">{domainInfo.icon}</span>
                              <span className="max-w-32 truncate">{domainInfo.name}</span>
                            </div>
                          );
                        }
                        return null;
                      }).filter(Boolean)}
                    </div>
                  ) : (step.id !== 'research') ? (
                    <ul className="list-disc pl-5 space-y-1 text-neutral-300 text-sm">
                      {extractBulletPoints(extractThinkContent(step.result)).map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">{step.result}</p>
                  )
                )}
                {step.status !== 'error' && !step.result && step.content && <p className="text-sm">{step.content}</p>}
                {step.status === 'error' && <p className="text-red-400 text-sm">An error occurred while processing this step.</p>}
              </div>
            </div>
          ))}
        </div>
        {/* Error display */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </motion.div>
      

    </div>
  );
};

export default Search; 
