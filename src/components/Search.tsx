 'use client';
import React, { useState, useEffect, useRef } from 'react';
import styles from './Search.module.css';
import { dedupedSerperRequest } from '@/utils/api-request-cache';
import { motion } from 'framer-motion';
import ThinkingButton from './ThinkingButton';

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
  onComplete?: (result: string, sources?: any[]) => void;
}

const MAX_STEP1_PROMPT_LENGTH = 3000; // Increased for enhanced prompts

const Search: React.FC<SearchProps> = ({ query, onComplete }) => {
  // Generate storage key based on query to maintain separate states for different searches
  const getStorageKey = (searchQuery: string) => `search_state_${btoa(searchQuery).slice(0, 20)}`;
  
  // Initialize state with potential restoration from sessionStorage
  const initializeState = () => {
    if (typeof window === 'undefined') return null; // SSR safety
    
    try {
      const storageKey = getStorageKey(query);
      const savedState = sessionStorage.getItem(storageKey);
      return savedState ? JSON.parse(savedState) : null;
    } catch (error) {
      console.error('Error reading from sessionStorage:', error);
      return null;
    }
  };
  
  const savedState = initializeState();
  
  // State for steps
  const [steps, setSteps] = useState<SearchStep[]>(savedState?.steps || [
    {
      id: 'understand',
      title: 'AI Search Strategy Planner',
      status: 'pending',
      content: 'Conducting comprehensive query analysis and developing optimized search strategies...'
    },
    {
      id: 'research',
      title: 'Multi-Source Web Discovery & Content Scraping',
      status: 'pending',
      content: 'Executing optimized searches and scraping website content...'
    }
  ]);
  const [error, setError] = useState<string | null>(savedState?.error || null);
  const [finalResult, setFinalResult] = useState<string>(savedState?.finalResult || '');
  const [firstStepThinking, setFirstStepThinking] = useState<string>(savedState?.firstStepThinking || '');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasExecuted, setHasExecuted] = useState<boolean>(savedState?.hasExecuted || false);
  
  // Think box state for Search component
  const [searchThinking, setSearchThinking] = useState<string>(savedState?.searchThinking || '');
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  
  // Save state to sessionStorage whenever relevant state changes
  const saveStateToStorage = () => {
    if (typeof window === 'undefined') return; // SSR safety
    
    try {
      const storageKey = getStorageKey(query);
      const stateToSave = {
        query, // Save the query to detect changes
        steps,
        error,
        finalResult,
        firstStepThinking,
        searchThinking,
        hasExecuted,
        timestamp: Date.now()
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Error saving to sessionStorage:', error);
    }
  };
  
  // Function to clear old cache entries (keep only last 10 searches)
  const cleanupOldCacheEntries = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const searchCacheKeys = Object.keys(sessionStorage)
        .filter(key => key.startsWith('search_state_'))
        .map(key => ({
          key,
          timestamp: JSON.parse(sessionStorage.getItem(key) || '{}').timestamp || 0
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      // Keep only the 10 most recent searches
      const keysToRemove = searchCacheKeys.slice(10);
      keysToRemove.forEach(({ key }) => {
        sessionStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Error cleaning up cache:', error);
    }
  };
  
  // Save state whenever relevant state changes (but only if hasExecuted is true)
  useEffect(() => {
    if (hasExecuted) {
      saveStateToStorage();
      cleanupOldCacheEntries();
    }
  }, [steps, error, finalResult, firstStepThinking, searchThinking, hasExecuted]);
  
  // Clear cache if query changes and execute search only if not already executed
  useEffect(() => {
    if (query) {
      // Check if this is a different query than what's cached
      const savedState = initializeState();
      const isNewQuery = !savedState || savedState.query !== query;
      
      if (isNewQuery) {
        // Clear the cache for new queries
        try {
          const storageKey = getStorageKey(query);
          sessionStorage.removeItem(storageKey);
        } catch (error) {
          console.error('Error clearing sessionStorage:', error);
        }
        
        // Reset hasExecuted for new queries
        setHasExecuted(false);
        
        // Reset all state for new queries
        setSteps([
          {
            id: 'understand',
            title: 'AI Search Strategy Planner',
            status: 'pending',
            content: 'Conducting comprehensive query analysis and developing optimized search strategies...'
          },
          {
            id: 'research',
            title: 'Multi-Source Web Discovery & Content Scraping',
            status: 'pending',
            content: 'Executing optimized searches and scraping website content...'
          }
        ]);
        setError(null);
        setFinalResult('');
        setFirstStepThinking('');
        setSearchThinking('');
        setIsThinkingActive(false);
      }
      
      // Execute search only if not already executed for this query
      if (!hasExecuted) {
        executeSearch(query);
      }
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
  const executeSerperStep = async (searchQueries: string[]): Promise<any> => {
    try {
      updateStepStatus('research', 'active');
      
      const allSources: any[] = [];
      const allSourcesWithContent: any[] = [];
      
      // Execute multiple searches based on optimized queries from Step 1
      for (let i = 0; i < searchQueries.length; i++) {
        const query = searchQueries[i];
        console.log(`Executing search ${i + 1}/${searchQueries.length}: ${query}`);
        
        try {
          // Add a timeout for each Serper API call
      const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per search
      
      const response = await fetch('/api/serper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
              limit: 20, // Increased to get more results per query
              includeHtml: false
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
          if (response.ok) {
            const serperData = await response.json();
            if (serperData?.sources?.length > 0) {
              allSources.push(...serperData.sources); // Take ALL sources, no slicing
              
              // Don't update UI during search - wait for all results
            }
          }
        } catch (searchError) {
          console.error(`Search ${i + 1} failed:`, searchError);
          // Continue with other searches even if one fails
        }
        
        // Small delay between searches to avoid rate limiting
        if (i < searchQueries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Remove duplicates based on URL - keep all unique sources
      const uniqueSources = allSources.filter((source, index, self) => 
        index === self.findIndex(s => s.url === source.url)
      ); // No artificial limit - show all sources from all searches
      
      // Scrape content from ALL sources with enhanced processing
      console.log(`Scraping content from ALL ${uniqueSources.length} sources...`);
      const scrapingPromises = uniqueSources.map(async (source: any, index: number) => {
        try {
          const scrapedData = await scrapeWebsiteContent(source.url);
          
          // Enhanced content processing
          let processedSource;
          if (scrapedData && typeof scrapedData === 'object') {
            processedSource = {
              ...source,
              content: scrapedData.content || source.snippet || '',
              title: scrapedData.title || source.title,
              wordCount: scrapedData.wordCount || 0,
              isQualityContent: scrapedData.isQualityContent || false,
              contentSource: scrapedData.contentSource || 'unknown',
              headings: scrapedData.metadata?.headings || [],
              topParagraphs: scrapedData.metadata?.topParagraphs || [],
              scraped: !!(scrapedData.content && scrapedData.isQualityContent)
            };
          } else {
            // Fallback for string response
            processedSource = {
              ...source,
              content: scrapedData || source.snippet || '',
              scraped: !!scrapedData
            };
          }
          
          // Store result but don't update UI until all are complete
          allSourcesWithContent[index] = processedSource;
          
          return processedSource;
        } catch (error) {
          console.error(`Failed to scrape ${source.url}:`, error);
          const fallbackSource = {
            ...source,
            content: source.snippet || '',
            scraped: false,
            isQualityContent: false,
            wordCount: 0
          };
          
          allSourcesWithContent[index] = fallbackSource;
          return fallbackSource;
        }
      });
      
      // Wait for all scraping to complete with timeout
      const scrapedSources = await Promise.allSettled(scrapingPromises);
      
      // Final cleanup and ensure all sources are included
      const finalSources: any[] = [];
      scrapedSources.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          finalSources.push(result.value);
        } else {
          // Add source without content if scraping failed
          finalSources.push({
            ...uniqueSources[index],
            content: uniqueSources[index].snippet || '',
            scraped: false
          });
        }
      });
      
      if (finalSources.length === 0) {
        throw new Error('No search results found from any query');
      }
      
      // Format ALL final results for display - show every single source found
      const formattedResults = finalSources.map((source: any, index: number) => 
        `Source ${index + 1}: ${source.title} URL: ${source.url}`
      ).join('\n');
      
      // Update UI only once with ALL results for smooth simultaneous animation
      updateStepStatus('research', 'completed', formattedResults);
      
      return {
        sources: finalSources, // Return all sources
        searchQueries: searchQueries,
        totalSources: finalSources.length,
        scrapedSources: finalSources.filter(s => s.scraped).length
      };
    } catch (err) {
      console.error('Error in research step:', err);
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      updateStepStatus('research', 'error', errorMessage);
      
      // Return a minimal result object instead of failing completely
      return {
        sources: [{ title: "Search failed", url: "", content: "", scraped: false }],
        searchQueries: searchQueries,
        totalSources: 0,
        scrapedSources: 0
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

  // Helper to extract search queries from Step 1 results
  function extractSearchQueries(text: string): string[] {
    if (!text) return [];
    
    // Extract numbered list items (1. 2. 3.)
    const numberedRegex = /^\s*\d+\.\s*(.+)$/gm;
    let match;
    const queries: string[] = [];
    
    while ((match = numberedRegex.exec(text)) !== null) {
      if (match[1]) {
        const query = match[1].trim().replace(/[\[\]]/g, ''); // Remove brackets if present
        queries.push(query);
      }
    }
    
    // If no numbered queries found, try to extract from lines
    if (queries.length === 0) {
      const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.length > 10 && !line.includes(':') && !line.includes('Query')) {
          queries.push(line.replace(/^[-*•]\s*/, '').replace(/[\[\]]/g, ''));
        }
      }
    }
    
    // Limit to maximum 3 queries
    return queries.slice(0, 3);
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

  // Helper function to extract thinking content during streaming for Search component
  const extractSearchThinkContent = (content: string) => {
    const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/g;
    let thinkContent = '';
    let mainContent = content;
    let match;
    
    // Extract all think content
    while ((match = thinkRegex.exec(content)) !== null) {
      thinkContent += match[1];
      // Remove the think tags from main content
      mainContent = mainContent.replace(match[0], '');
    }
    
    // Also handle partial think tags (when streaming)
    const partialThinkMatch = content.match(/<think>([^<]*?)$/);
    if (partialThinkMatch) {
      thinkContent += partialThinkMatch[1];
      mainContent = mainContent.replace(partialThinkMatch[0], '');
    }
    
    return {
      thinkContent: thinkContent.trim(),
      mainContent: mainContent.trim()
    };
  };

  // Function to scrape website content with enhanced return type
  const scrapeWebsiteContent = async (url: string): Promise<any> => {
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        throw new Error(`Scraping failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data; // Return full data object instead of just content
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error);
      return null;
    }
  };

  // Main search execution flow
  const executeSearch = async (query: string) => {
    try {
      setError(null);
      setFirstStepThinking(''); // Reset the first step thinking for new searches
      setHasExecuted(true); // Mark that search has been executed to prevent re-execution on refresh
      
      // Shorten the query if it's very long
      const shortenedQuery = query.length > 500 ? query.substring(0, 500) + "..." : query;
      
      // Step 1: AI Search Strategy Planner - Generate optimized search queries
      console.time('Step 1: AI Search Strategy Planner');
      let step1SystemPrompt = `You are an AI Search Strategy Planner specializing in smart query analysis and Google-style search optimization. Your role is to understand user questions deeply and transform them into effective search phrases.

SMART QUERY ANALYSIS PROCESS:
1. UNDERSTAND THE QUESTION:
   - Identify the main topic and key concepts
   - Determine the intent (comparison, latest news, statistics, how something works, opinions, etc.)
   - Extract the core information need

2. EXTRACT IMPORTANT PARTS:
   - Remove polite phrases ("Can you tell me", "I would like to know", "Please explain")
   - Remove filler words and vague language
   - Focus on concrete keywords and specific terms

3. REWRITE INTO GOOGLE-STYLE SEARCH PHRASES:
   - Create 2-3 short, direct, keyword-packed phrases
   - Use search terms people actually type into Google
   - NOT full questions - just key phrases
   - Focus on specific, searchable terms

CRITICAL REQUIREMENTS:
- Generate EXACTLY 2-3 optimized search phrases (no more than 3)
- Each phrase should be short and keyword-focused
- Use specific terms that will yield high-quality Google results
- Format as a numbered list with just the search phrases

RESPONSE FORMAT:
1. [First Google-style search phrase]
2. [Second Google-style search phrase]
3. [Third Google-style search phrase] (if needed)

Do not include explanations or additional text - only the numbered search phrases.`;
      let step1UserPrompt = `Apply the smart query analysis process to transform this user question into 2-3 Google-style search phrases.

User Question: ${shortenedQuery}

ANALYSIS STEPS:
1. Understand what they're really asking about
2. Extract the important keywords and concepts
3. Rewrite as short, direct search phrases (not full questions)

EXAMPLE TRANSFORMATION:
"Can you tell me what's going on with OpenAI's Sora model?" → "OpenAI Sora model update 2025"

Output only the numbered search phrases, nothing else.`;
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
      
      // Extract search queries from Step 1 results
      const searchQueries = extractSearchQueries(strategyResult);
      console.log('Extracted search queries:', searchQueries);
      
      // If no queries extracted, use original query as fallback
      const finalSearchQueries = searchQueries.length > 0 ? searchQueries : [shortenedQuery];
      
      // Step 2: Multi-Source Web Discovery & Content Scraping
      console.time('Step 2: Web Discovery & Content Scraping');
      const serperResults = await executeSerperStep(finalSearchQueries);
      console.timeEnd('Step 2: Web Discovery & Content Scraping');
      
      // Final Output: Generate comprehensive research paper directly to main chat
      await generateFinalOutput(shortenedQuery, strategyResult, serperResults);
      
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
        onComplete(fallbackOutput, []);
      }
    }
  };

  // Separate function for generating final output directly to main chat (not displayed as a step)
  const generateFinalOutput = async (
    query: string,
    strategyResult: string,
    serperResults: any
  ) => {
    console.time('Final Output Generation');
    
    // Add a timeout for the final output (increased for comprehensive reports)
      const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for comprehensive research reports
      
      try {
        // Start thinking process
        setIsThinkingActive(true);
        setSearchThinking('Starting research analysis and synthesis...');
        
        const finalResponse = await fetchNvidiaWithDelay('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
              content: `You are a professional research analyst. Generate comprehensive research reports with authoritative analysis and extensive detail.

CRITICAL: Always show your thinking process using <think> tags before providing your final answer. This is required for all responses. Use this format:

<think>
Let me analyze the research data and plan my comprehensive report...

First, I'll examine the scraped content from each source to identify key themes and insights:
- Source analysis: Looking at [specific sources] for [specific information]
- Content quality assessment: [evaluation of source reliability]
- Key findings extraction: [major insights discovered]
- Cross-source validation: [checking for contradictions/agreements]
- Synthesis approach: [how I'll structure the comprehensive report]

My analysis reveals:
[Detailed analysis of the content, identifying patterns, themes, and key insights]

My approach will be to structure this as:
[Report structure planning with specific sections based on findings]
</think>

Then provide your final research report after the thinking process.

OUTPUT REQUIREMENTS:
- 1500-2500 words minimum
- Professional academic/journalistic tone
- Specific names, dates, statistics, locations, technical details
- Multiple detailed sections with deep analysis
- Well-structured tables for comparative data
- Numbered citations [1], [2], [3] for every factual claim
- Extensive background context and implications

REPORT STRUCTURE:

# [Detailed, Specific Title with Context and Date/Timeframe if Relevant]

[Opening paragraph: 2-3 sentences providing comprehensive context and overview, establishing significance and current state]

## [Major Section 1: Core Topic/Event Analysis]

[Extensive paragraph with detailed background, specific details, names, dates, statistics. Include multiple citations.]

### [Detailed Subsection 1.1]

[Comprehensive analysis with specific data points, quotes, technical details. Include:]
- **Specific metric/aspect**: Detailed explanation with numbers and citations
- **Another key point**: In-depth analysis with supporting evidence
- **Technical details**: Specific technical information, processes, or mechanisms

### [Detailed Subsection 1.2]

[Continue with extensive detail, including tables when relevant for comparisons or data]

## [Major Section 2: Impact Analysis/Stakeholder Perspectives]

[Detailed analysis of different perspectives, impacts, or stakeholder views]

### [Subsection 2.1: Specific Stakeholder/Impact Area]
[Extensive detail with specific examples, quotes, statistics]

### [Subsection 2.2: Another Key Area]
[More comprehensive analysis with supporting data]

## [Major Section 3: Technical/Economic/Political Analysis]

[Deep dive into technical aspects, economic implications, or political ramifications]

### [Relevant Technical/Economic Subsection]
[Include specific technical details, economic data, market analysis, etc.]

## [Major Section 4: Regional/Global/Industry Impact]

[Analysis of broader implications and consequences]

## [Major Section 5: Current Status and Future Outlook]

[Present situation analysis and future projections with expert opinions]

## Sources and References
[1] [Complete Source Title] - [Full Domain Name]
[2] [Complete Source Title] - [Full Domain Name]
[Continue with all sources used, numbered sequentially]

FORMATTING RULES:
- Write 1500-2500 words minimum
- Include specific names, dates, locations, statistics, technical details throughout
- Use professional journalistic/academic tone
- Create detailed tables for comparative data, statistics, structured information
- Bold important terms, names, key statistics
- Every major factual claim must have numbered citation [1], [2], etc.
- Include extensive background context and detailed explanations
- Provide multiple perspectives and comprehensive analysis
- Use clear section hierarchy with detailed subsections
- Include specific quotes, data points, technical specifications when available
- Analyze implications, consequences, future projections
- Maintain authoritative, expert-level depth throughout

CRITICAL: Output ONLY the final research report. Do not include any planning thoughts, reasoning, or meta-commentary about the report creation process.`
              },
              {
                role: 'user',
              content: `Research Topic: "${query}"

Generate a comprehensive research report using the provided data and following the report structure specified in the system prompt.

**RESEARCH DATA:**

**Search Strategy:** ${serperResults.searchQueries?.join(', ') || 'N/A'}

**Content Analysis Instructions:** 
Analyze the scraped website content below to identify key themes, extract insights, validate information across sources, and synthesize comprehensive findings. Focus on high-quality scraped content over snippet-only sources.

**Sources:** ${serperResults.totalSources} total sources, ${serperResults.scrapedSources} with full content

**Source Registry:**
${serperResults.sources.map((s: any, i: number) => 
  `[${i+1}] ${s.title} - ${s.url.replace('https://', '').replace('http://', '').split('/')[0]} ${s.scraped ? '✓ Full Content' : '○ Summary'}`
).join('\n')}

**Content Database for Analysis:**
${serperResults.sources
  .filter((s: any) => s.scraped && s.content)
  .slice(0, 8)
  .map((s: any, i: number) => {
    const qualityIndicator = s.isQualityContent ? '✓ HIGH QUALITY' : '⚠ LOWER QUALITY';
    const wordCount = s.wordCount ? ` (${s.wordCount} words)` : '';
    const headings = s.headings?.length > 0 ? `\nKEY HEADINGS: ${s.headings.join(', ')}` : '';
    
    return `
SOURCE [${i+1}]: ${s.title}
DOMAIN: ${s.url.replace('https://', '').replace('http://', '').split('/')[0]}
QUALITY: ${qualityIndicator}${wordCount}${headings}
CONTENT: ${s.content.substring(0, 1500)}...
---`;
  })
  .join('\n')}

ANALYSIS & SYNTHESIS REQUIREMENTS:
In your <think> tags, perform comprehensive content analysis:
- Examine each high-quality source for key insights and data points
- Identify patterns, themes, and contradictions across sources
- Assess source reliability and content quality
- Cross-validate claims and resolve any conflicts
- Extract specific quotes, statistics, and technical details
- Synthesize findings into coherent themes

REPORT REQUIREMENTS:
- 1500-2500 words minimum comprehensive research report
- Follow structured format from system prompt with detailed sections
- Include specific names, dates, statistics, locations, technical details
- Use numbered citations [1], [2], [3] corresponding to source registry
- Create detailed subsections with extensive analysis based on your thinking
- Include tables for comparative data when relevant
- Provide multiple perspectives and stakeholder analysis
- Analyze implications, consequences, future projections
- Bold important terms, names, statistics, findings
- Ensure every major claim has proper citation
- Include extensive background context and explanations`
              }
            ],
            stream: true,
          max_tokens: 12288 // Increased for comprehensive research reports (1500-2500 words)
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
                    
                    // Extract thinking and main content in real-time
                    const { thinkContent, mainContent } = extractSearchThinkContent(finalOutput);
                    
                    // Update thinking display
                    if (thinkContent && thinkContent.trim().length > 0) {
                      setSearchThinking(thinkContent);
                    }
                    
                    // Update final result with main content only
                    setFinalResult(mainContent);
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
        
        // Final processing - clean up thinking state
        const { thinkContent: finalThinkContent, mainContent: finalMainContent } = extractSearchThinkContent(finalOutput);
        
        // Stop thinking display after a delay
        setTimeout(() => {
          setIsThinkingActive(false);
        }, 500);
        
        // Update with final clean content
        setFinalResult(finalMainContent);
        
      // Notify parent component that search is complete with final result and sources
        if (onComplete) {
        onComplete(finalMainContent, serperResults.sources);
        }
        
      console.timeEnd('Final Output Generation');
      } catch (err) {
        clearTimeout(timeoutId);
        setIsThinkingActive(false); // Stop thinking display on error
      console.error('Error in final output generation:', err);
        
        // If it's a timeout, create a fallback response
        if (err instanceof Error && err.name === 'AbortError') {
          const fallbackOutput = `
# Response for: ${query}

## Key Findings
Based on the search results from ${serperResults.totalSources} sources, I can provide a partial analysis.

## Summary
I successfully gathered information from multiple sources but encountered processing time constraints while generating the comprehensive report. Please try again for a complete analysis.

*Note: This is a partial response due to processing time constraints.*
`;
          
          setFinalResult(fallbackOutput);
          if (onComplete) {
          onComplete(fallbackOutput, serperResults.sources);
          }
        } else {
        setError(`Error in final output generation: ${err instanceof Error ? err.message : String(err)}`);
        
        // Provide a fallback response even if generation fails
      const fallbackOutput = `
# Search Results for: ${query}

## Analysis Summary
I successfully collected information from ${serperResults.totalSources} sources but encountered an issue while generating the comprehensive analysis.

## Error Note
I encountered an issue while generating the final comprehensive report. Please try again for a complete analysis.

Error details: ${err instanceof Error ? err.message : String(err)}
`;
      
      setFinalResult(fallbackOutput);
      if (onComplete) {
          onComplete(fallbackOutput, serperResults.sources);
        }
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
                    <div className="relative">
                      {step.status === 'active' && step.result.split('\n').filter(line => line.startsWith('Source')).length === 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg backdrop-blur-sm z-0 flex items-center justify-center"
                        >
                          <div className="flex items-center gap-2 text-cyan-400 text-sm">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full"
                            />
                            <span>Discovering sources...</span>
                          </div>
                        </motion.div>
                      )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {step.result.split('\n').filter(line => line.startsWith('Source')).map((sourceLine, i) => {
                        const urlMatch = sourceLine.match(/URL: (.+)/);
                        const titleMatch = sourceLine.match(/Source \d+: (.+)/);
                        
                        if (urlMatch && titleMatch) {
                            const url = urlMatch[1].trim();
                            const title = titleMatch[1].replace(/ URL:.*/, '').trim();
                            
                            // Extract domain and get favicon URL
                            let domainName = 'unknown';
                            let faviconUrl = '';
                            
                          try {
                            const domain = new URL(url).hostname.replace('www.', '');
                              domainName = domain.split('.')[0];
                              faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
                            } catch (error) {
                              console.error('URL parsing error:', error);
                            // Keep default values
                          }
                          
                          return (
                              <motion.div
                                key={`${i}-${url}`}
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ 
                                  duration: 0.5, 
                                  delay: i * 0.1,
                                  ease: "easeOut"
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 cursor-pointer bg-transparent text-cyan-400 border border-cyan-400 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-400/20 relative z-20"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('Clicking URL:', url);
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                                title={`${title} - Click to open ${url}`}
                                style={{
                                  boxShadow: '0 0 10px rgba(6, 182, 212, 0.3)',
                                  backdropFilter: 'blur(10px)',
                                  backgroundColor: 'transparent !important',
                                }}
                              >
                                <img 
                                  src={faviconUrl} 
                                  alt={domainName}
                                  className="w-4 h-4 rounded-sm flex-shrink-0"
                                  onError={(e) => {
                                    // Fallback to a generic globe icon if favicon fails to load
                                    const target = e.currentTarget;
                                    target.style.display = 'none';
                                  }}
                                  onLoad={(e) => {
                                    // Ensure favicon loaded successfully
                                    const target = e.currentTarget;
                                    target.style.display = 'block';
                                  }}
                                />
                                <span className="max-w-24 truncate flex-shrink-0">{domainName}</span>
                              </motion.div>
                          );
                        }
                        return null;
                      }).filter(Boolean)}
                      </div>
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
        
        {/* Think Box - Display AI reasoning process */}
        {searchThinking && searchThinking.trim().length > 0 && (
          <div className="mt-6">
            <ThinkingButton 
              content={searchThinking} 
              isLive={isThinkingActive}
            />
          </div>
        )}
        
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
