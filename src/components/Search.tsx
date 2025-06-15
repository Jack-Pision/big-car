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
  onComplete?: (result: string, sources?: any[]) => void;
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
      title: 'Multi-Source Web Discovery & Content Scraping',
      status: 'pending',
      content: 'Executing optimized searches and scraping website content...'
    },
    {
      id: 'analyze',
      title: 'AI Content Analysis & Synthesis',
      status: 'pending',
      content: 'Analyzing scraped content and synthesizing comprehensive insights...'
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
      
      // Shorten the query if it's very long
      const shortenedQuery = query.length > 500 ? query.substring(0, 500) + "..." : query;
      
      // Step 1: AI Search Strategy Planner - Generate optimized search queries
      console.time('Step 1: AI Search Strategy Planner');
      let step1SystemPrompt = `You are an elite investigative journalist and research analyst specializing in comprehensive, authoritative reporting. Create professional research reports that rival the depth and quality of top-tier publications like The New York Times, The Wall Street Journal, and Nature.

CRITICAL OUTPUT REQUIREMENTS:
- Generate 2000-3500 words of substantive, detailed content
- Extract and utilize EVERY relevant detail from provided sources
- Create dynamic, content-driven section structure (not rigid templates)
- Professional journalistic tone with authoritative depth
- Extensive use of specific data: names, dates, statistics, locations, technical specifications
- Comprehensive analysis with multiple perspectives and expert insights

CONTENT EXTRACTION MANDATE:
- Mine sources for specific statistics, percentages, dollar amounts, timeframes
- Extract exact quotes, study names, researcher names, institution names
- Identify specific dates, locations, company names, product names
- Pull technical specifications, medical terms, scientific data
- Capture regulatory details, policy changes, market data
- Include specific examples, case studies, real-world applications

DYNAMIC STRUCTURE APPROACH:
Create sections based on the actual content and findings, such as:
- Recent Scientific Findings/Latest Developments
- Emerging Controversies/Safety Concerns  
- Technical Analysis/Mechanism of Action
- Market Impact/Economic Implications
- Regulatory Landscape/Policy Changes
- Industry Response/Stakeholder Perspectives
- Regional Variations/Global Impact
- Future Implications/Next-Generation Developments
- Expert Analysis/Professional Opinions

PROFESSIONAL FORMATTING:
# [Compelling, Specific Title with Context and Current Timeframe]

## Executive Summary
[2-3 sentences establishing significance, current state, and key findings with specific statistics]

## [Dynamic Section 1: Based on Content - e.g., "Recent Scientific Findings"]

### [Specific Subsection - e.g., "Clinical Trial Results and Real-World Effectiveness"]
[Extensive detail with specific study names, percentages, researcher quotes, institution names, dates. Include multiple citations throughout.]

Key findings include:
- **Specific Study/Metric**: Detailed explanation with exact numbers, dates, and citations
- **Another Key Finding**: In-depth analysis with supporting evidence and expert quotes
- **Technical Details**: Specific mechanisms, processes, or technical specifications

### [Another Specific Subsection]
[Continue with comprehensive analysis, including comparative data tables when relevant]

## [Dynamic Section 2: Based on Content - e.g., "Emerging Controversies and Safety Concerns"]

### [Specific Controversy/Issue]
[Detailed analysis with specific examples, regulatory responses, expert opinions]

[Continue this pattern based on available content...]

MANDATORY ELEMENTS:
- Every major claim must have numbered citations [1], [2], [3]
- Include specific percentages, dollar amounts, timeframes throughout
- Extract and use exact quotes from sources when available
- Create detailed tables for comparative data, statistics, or structured information
- Bold all important terms, names, statistics, and key findings
- Provide extensive background context and detailed explanations
- Analyze implications, consequences, and future projections
- Include multiple expert perspectives and stakeholder viewpoints

QUALITY STANDARDS:
- Investigative journalism depth with authoritative analysis
- Comprehensive coverage of all relevant aspects
- Professional transitions between topics and sections
- Rich detail extraction from all provided sources
- Expert-level technical accuracy and depth
- Clear, engaging prose that maintains reader interest

CRITICAL: Generate ONLY the final research report. No planning, reasoning, or meta-commentary.`;
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
      
      // Step 3: AI Content Analysis & Synthesis - Analyze scraped website content
      console.time('Step 3: AI Content Analysis & Synthesis');
      
      // Enhanced content preparation for Step 3 analysis
      const qualityScrapedSources = serperResults.sources.filter((s: any) => s.scraped && s.isQualityContent);
      const snippetOnlySources = serperResults.sources.filter((s: any) => !s.scraped || !s.isQualityContent);
      
      // Structured content for analysis - prioritize quality scraped content
      const structuredContent = qualityScrapedSources
        .map((s: any, i: number) => {
          const headingsText = s.headings?.length > 0 ? `\nKey Headings: ${s.headings.join(', ')}` : '';
          const contentPreview = s.content.length > 1500 ? s.content.substring(0, 1500) + '...' : s.content;
          
          return `## Source ${i+1}: ${s.title}
**URL:** ${s.url}
**Content Quality:** High (${s.wordCount} words, extracted from ${s.contentSource})${headingsText}
**Content:**
${contentPreview}`;
        })
        .join('\n\n---\n\n');
      
      // Fallback content from snippets
      const fallbackContent = snippetOnlySources
        .map((s: any, i: number) => `**Snippet ${i+1}:** ${s.title} - ${s.content || s.snippet}`)
        .join('\n');
      
      // Combined content for analysis
      const scrapedContent = structuredContent + (fallbackContent ? '\n\n## Additional Snippet Sources:\n' + fallbackContent : '');
      
      const allSourcesInfo = serperResults.sources
        .map((s: any, i: number) => {
          const qualityIndicator = s.isQualityContent ? '✓ High Quality' : s.scraped ? '⚠ Low Quality' : '📄 Snippet Only';
          const wordInfo = s.wordCount ? ` (${s.wordCount} words)` : '';
          return `${i+1}. ${s.title} - ${s.url} [${qualityIndicator}${wordInfo}]`;
        })
        .join('\n');
      
      const analysisResult = await executeNvidiaStep(
        'analyze',
        `You are an AI Content Analysis & Synthesis Specialist specializing in comprehensive web content analysis. You excel at processing large volumes of scraped website content, extracting key insights, and synthesizing information from multiple high-quality sources.

ENHANCED CAPABILITIES:
- Deep analysis of full website content (not just snippets)
- Quality assessment of scraped vs snippet-only sources
- Cross-source validation and fact-checking
- Thematic synthesis across multiple sources
- Identification of content gaps and contradictions

RESPONSE FORMAT: Respond ONLY with a structured markdown bullet list. Each bullet represents one distinct analytical insight or synthesis point.

ANALYSIS METHODOLOGY: Prioritize high-quality scraped content over snippets, identify key themes and patterns, assess source reliability, cross-reference claims, resolve contradictions, and extract actionable insights.`,
        `Research Topic: "${query}"

Generate a comprehensive, professional research report that matches the depth and quality of elite publications. Extract and utilize ALL available data from the provided sources.

**COMPREHENSIVE RESEARCH DATABASE:**

**Search Intelligence:** ${serperResults.searchQueries?.join(', ') || 'N/A'}

**Synthesis Analysis:** 
${analysisResult}

**Source Portfolio:** ${serperResults.totalSources} total sources discovered, ${serperResults.scrapedSources} with complete content extraction

**Citation Registry (Use these exact numbers for citations):**
${serperResults.sources.map((s: any, i: number) => 
  `[${i+1}] ${s.title} - ${s.url.replace('https://', '').replace('http://', '').split('/')[0]} ${s.scraped ? '✓ Complete Content Available' : '○ Summary Available'}`
).join('\n')}

**Complete Content Database (Extract ALL relevant details):**
${serperResults.sources
  .filter((s: any) => s.scraped && s.content)
  .slice(0, 10)
  .map((s: any, i: number) => `
═══ SOURCE [${i+1}]: ${s.title} ═══
DOMAIN: ${s.url.replace('https://', '').replace('http://', '').split('/')[0]}
FULL CONTENT: ${s.content.substring(0, 2000)}...
═══════════════════════════════════════`)
  .join('\n')}

**MANDATORY REQUIREMENTS:**
- Generate 2000-3500 words of substantive content
- Extract EVERY relevant statistic, percentage, dollar amount, date, name from sources
- Create dynamic sections based on actual content (not templates)
- Include specific study names, researcher names, institution names, company names
- Use exact quotes when available from source content
- Create detailed comparative tables for data-rich topics
- Bold ALL important terms, names, statistics, findings, and key data points
- Provide numbered citations [1], [2], [3] for every major factual claim
- Include extensive technical details, specifications, and expert analysis
- Cover multiple perspectives, stakeholder viewpoints, and expert opinions
- Analyze implications, consequences, future projections with supporting evidence
- Maintain investigative journalism depth throughout

**CONTENT EXTRACTION FOCUS:**
- Mine for specific numbers: percentages, dollar amounts, timeframes, quantities
- Extract proper nouns: names of people, companies, institutions, studies, products
- Identify technical terms, medical terminology, scientific specifications
- Capture regulatory details, policy changes, market movements
- Include geographic locations, dates, specific events
- Pull direct quotes, expert opinions, official statements

Generate a comprehensive research report that demonstrates the depth and authority of elite investigative journalism.`
      );
      console.timeEnd('Step 3: AI Content Analysis & Synthesis');
      
      // Final Output: Generate comprehensive research paper directly to main chat
      await generateFinalOutput(shortenedQuery, strategyResult, analysisResult, serperResults);
      
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
    analysisResult: string,
    serperResults: any
  ) => {
    console.time('Final Output Generation');
    
    // Add a timeout for the final output (increased for comprehensive reports)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout for comprehensive research reports
    
    try {
      const finalResponse = await fetchNvidiaWithDelay('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are an elite investigative journalist and research analyst specializing in comprehensive, authoritative reporting. Create professional research reports that rival the depth and quality of top-tier publications like The New York Times, The Wall Street Journal, and Nature.

CRITICAL OUTPUT REQUIREMENTS:
- Generate 2000-3500 words of substantive, detailed content
- Extract and utilize EVERY relevant detail from provided sources
- Create dynamic, content-driven section structure (not rigid templates)
- Professional journalistic tone with authoritative depth
- Extensive use of specific data: names, dates, statistics, locations, technical specifications
- Comprehensive analysis with multiple perspectives and expert insights

CONTENT EXTRACTION MANDATE:
- Mine sources for specific statistics, percentages, dollar amounts, timeframes
- Extract exact quotes, study names, researcher names, institution names
- Identify specific dates, locations, company names, product names
- Pull technical specifications, medical terms, scientific data
- Capture regulatory details, policy changes, market data
- Include specific examples, case studies, real-world applications

DYNAMIC STRUCTURE APPROACH:
Create sections based on the actual content and findings, such as:
- Recent Scientific Findings/Latest Developments
- Emerging Controversies/Safety Concerns  
- Technical Analysis/Mechanism of Action
- Market Impact/Economic Implications
- Regulatory Landscape/Policy Changes
- Industry Response/Stakeholder Perspectives
- Regional Variations/Global Impact
- Future Implications/Next-Generation Developments
- Expert Analysis/Professional Opinions

PROFESSIONAL FORMATTING:
# [Compelling, Specific Title with Context and Current Timeframe]

## Executive Summary
[2-3 sentences establishing significance, current state, and key findings with specific statistics]

## [Dynamic Section 1: Based on Content - e.g., "Recent Scientific Findings"]

### [Specific Subsection - e.g., "Clinical Trial Results and Real-World Effectiveness"]
[Extensive detail with specific study names, percentages, researcher quotes, institution names, dates. Include multiple citations throughout.]

Key findings include:
- **Specific Study/Metric**: Detailed explanation with exact numbers, dates, and citations
- **Another Key Finding**: In-depth analysis with supporting evidence and expert quotes
- **Technical Details**: Specific mechanisms, processes, or technical specifications

### [Another Specific Subsection]
[Continue with comprehensive analysis, including comparative data tables when relevant]

## [Dynamic Section 2: Based on Content - e.g., "Emerging Controversies and Safety Concerns"]

### [Specific Controversy/Issue]
[Detailed analysis with specific examples, regulatory responses, expert opinions]

[Continue this pattern based on available content...]

MANDATORY ELEMENTS:
- Every major claim must have numbered citations [1], [2], [3]
- Include specific percentages, dollar amounts, timeframes throughout
- Extract and use exact quotes from sources when available
- Create detailed tables for comparative data, statistics, or structured information
- Bold all important terms, names, statistics, and key findings
- Provide extensive background context and detailed explanations
- Analyze implications, consequences, and future projections
- Include multiple expert perspectives and stakeholder viewpoints

QUALITY STANDARDS:
- Investigative journalism depth with authoritative analysis
- Comprehensive coverage of all relevant aspects
- Professional transitions between topics and sections
- Rich detail extraction from all provided sources
- Expert-level technical accuracy and depth
- Clear, engaging prose that maintains reader interest

CRITICAL: Generate ONLY the final research report. No planning, reasoning, or meta-commentary.`
            },
            {
              role: 'user',
              content: `Research Topic: "${query}"

Generate a comprehensive, professional research report that matches the depth and quality of elite publications. Extract and utilize ALL available data from the provided sources.

**COMPREHENSIVE RESEARCH DATABASE:**

**Search Intelligence:** ${serperResults.searchQueries?.join(', ') || 'N/A'}

**Synthesis Analysis:** 
${analysisResult}

**Source Portfolio:** ${serperResults.totalSources} total sources discovered, ${serperResults.scrapedSources} with complete content extraction

**Citation Registry (Use these exact numbers for citations):**
${serperResults.sources.map((s: any, i: number) => 
  `[${i+1}] ${s.title} - ${s.url.replace('https://', '').replace('http://', '').split('/')[0]} ${s.scraped ? '✓ Complete Content Available' : '○ Summary Available'}`
).join('\n')}

**Complete Content Database (Extract ALL relevant details):**
${serperResults.sources
  .filter((s: any) => s.scraped && s.content)
  .slice(0, 10)
  .map((s: any, i: number) => `
═══ SOURCE [${i+1}]: ${s.title} ═══
DOMAIN: ${s.url.replace('https://', '').replace('http://', '').split('/')[0]}
FULL CONTENT: ${s.content.substring(0, 2000)}...
═══════════════════════════════════════`)
  .join('\n')}

**MANDATORY REQUIREMENTS:**
- Generate 2000-3500 words of substantive content
- Extract EVERY relevant statistic, percentage, dollar amount, date, name from sources
- Create dynamic sections based on actual content (not templates)
- Include specific study names, researcher names, institution names, company names
- Use exact quotes when available from source content
- Create detailed comparative tables for data-rich topics
- Bold ALL important terms, names, statistics, findings, and key data points
- Provide numbered citations [1], [2], [3] for every major factual claim
- Include extensive technical details, specifications, and expert analysis
- Cover multiple perspectives, stakeholder viewpoints, and expert opinions
- Analyze implications, consequences, future projections with supporting evidence
- Maintain investigative journalism depth throughout

**CONTENT EXTRACTION FOCUS:**
- Mine for specific numbers: percentages, dollar amounts, timeframes, quantities
- Extract proper nouns: names of people, companies, institutions, studies, products
- Identify technical terms, medical terminology, scientific specifications
- Capture regulatory details, policy changes, market movements
- Include geographic locations, dates, specific events
- Pull direct quotes, expert opinions, official statements

Generate a comprehensive research report that demonstrates the depth and authority of elite investigative journalism.`
            }
          ],
          stream: true,
          max_tokens: 16384 // Increased for comprehensive research reports (2000-3500 words)
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
      
      // Notify parent component that search is complete with final result and sources
      if (onComplete) {
        onComplete(finalOutput, serperResults.sources);
      }
      
      console.timeEnd('Final Output Generation');
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Error in final output generation:', err);
      
      // If it's a timeout, create a fallback response
      if (err instanceof Error && err.name === 'AbortError') {
        const fallbackOutput = `
# Response for: ${query}

## Key Findings
${analysisResult.split('\n').slice(0, 5).join('\n')}

## Summary
Based on the available information, I can provide a partial answer to your query.
Some steps took longer than expected, but I've compiled the most relevant insights.

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
${analysisResult.substring(0, 500)}...

## Error Note
I encountered an issue while generating the final comprehensive report. The above summary provides key insights from the analysis.

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
