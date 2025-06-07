import { useState, useEffect, useMemo, useRef } from 'react';
import { extractRedditUsername } from '@/utils/reddit-api';
import { dedupedSerperRequest, isQueryActive, markQueryActive, markQueryInactive } from '@/utils/api-request-cache';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'completed';
  output: any;
  streamedContent?: string[];
}

// Default thinking steps that will be used for every query
const DEFAULT_THINKING_STEPS: ThinkingStep[] = [
  {
    id: 'understand',
    title: 'Understanding the Query',
    content: '',
    status: 'pending',
    output: null // Will store the AI's analysis
  },
  {
    id: 'research',
    title: 'Gathering Research',
    content: '',
    status: 'pending',
    output: null // Will store the fetched web data
  },
  {
    id: 'synthesize',
    title: 'Synthesizing Response',
    content: '',
    status: 'pending',
    output: null // Will store the final AI response
  }
];

const STEP_TIMINGS = {
  understand: { min: 2000, max: 4000 },
  research: { min: 4000, max: 7000 },
  synthesize: { min: 3000, max: 5000 }
};

const THINKING_CONTENT = {
  understand: [
    "Analyzing your question in detail to understand the key concepts and requirements.",
    "Breaking down the query to identify the specific information needed.",
    "Planning the research approach to gather the most relevant information."
  ],
  research: [
    "Searching the web for authoritative sources.",
    "Gathering and filtering the most relevant information from trusted sources.",
    "Cross-referencing information across multiple sources for accuracy."
  ],
  synthesize: [
    "Organizing the research into a concise, direct response.",
    "Creating a focused answer with inline web citations.",
    "Ensuring the answer directly addresses your specific question."
  ]
};

// Function to get a random thinking content with the query injected
const getRandomThinkingContent = (stepId: string, query: string): string => {
  const contents = THINKING_CONTENT[stepId as keyof typeof THINKING_CONTENT] || [];
  const randomIndex = Math.floor(Math.random() * contents.length);
  let content = contents[randomIndex]?.replace(/\{query\}/g, query) || '';

  // For the Reddit step, create specialized thinking content
  if (stepId === 'reddit') {
    const username = extractRedditUsername(query);
    
    if (username) {
      content = `
## Analyzing Reddit User: u/${username}

I'm examining the available data for this Reddit user to understand:

- Account history and creation date
- Karma score and distribution
- Recent posting activity
- Comment patterns and engagement
- Most active subreddits
- Topics of interest
- Potential expertise areas

This analysis will help provide a more complete understanding of the user's online presence and interests.
      `;
    } else {
      content = `
## Checking for Reddit-Related Information

The query doesn't appear to contain a specific Reddit username. Skipping detailed Reddit analysis, but I'll still consider any Reddit-related concepts that might be relevant to answering the query completely.
      `;
    }
  }

  return content;
};

// Random time between min and max
const getRandomTime = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

interface WebData {
  serperArticles: any[];
  sources: any[];
  webCitations: string;
}

// Add interface for conversation context
interface ResearchConversation {
  previousQueries: string[];
  previousResponses: string[];
}

export const useDeepResearch = (
  isActive: boolean, 
  query: string = '', 
  conversationHistory: ResearchConversation = { previousQueries: [], previousResponses: [] },
  isRestoredFromStorage: boolean = false, // Add flag for restored from storage
  restoredState: {
    steps?: ThinkingStep[];
    activeStepId?: string | null;
    isComplete?: boolean;
    isInProgress?: boolean;
    webData?: WebData | null;
    isFullyCompleted?: boolean; // Add flag to indicate search is fully completed
  } = {} // Add optional restored state parameter
) => {
  // Initialize with restored state if provided, otherwise use defaults
  const [steps, setSteps] = useState<ThinkingStep[]>(
    restoredState.steps || [...DEFAULT_THINKING_STEPS]
  );
  const [activeStepId, setActiveStepId] = useState<string | null>(
    restoredState.activeStepId || null
  );
  const [isComplete, setIsComplete] = useState(
    restoredState.isComplete || false
  );
  const [isInProgress, setIsInProgress] = useState(
    restoredState.isInProgress || false
  );
  const [webData, setWebData] = useState<WebData | null>(
    restoredState.webData || null
  );
  const [error, setError] = useState<string | null>(null);
  
  // New flag to determine if API calls should be skipped entirely
  const isFullyCompleted = useMemo(() => {
    return restoredState.isFullyCompleted === true;
  }, [restoredState.isFullyCompleted]);

  // Guard to prevent duplicate research step per query
  const researchStepCalledRef = useRef<{ [query: string]: boolean }>({});

  // Reset everything when a new query starts
  useEffect(() => {
    // Skip API calls if this is a fully completed search
    if (isFullyCompleted) {
      return;
    }
    
    // Only start the process if not restored from storage and other conditions are met
    if (query && isActive && !isInProgress && !isRestoredFromStorage) {
      setSteps([...DEFAULT_THINKING_STEPS]);
      setActiveStepId(null);
      setIsComplete(false);
      setIsInProgress(true);
      setWebData(null);
      setError(null);
      
      // Start the process with understanding step
      processUnderstandStep(query, conversationHistory);
    }
    
    if (!isActive) {
      setIsInProgress(false);
      setIsComplete(false);
    }
  }, [query, isActive, conversationHistory, isRestoredFromStorage, isFullyCompleted]);

  // Step 1: Understanding - Call AI to analyze the query
  const processUnderstandStep = async (query: string, conversationHistory: ResearchConversation) => {
    try {
      setActiveStepId('understand');
      updateStepStatus('understand', 'active', 'Analyzing your query...', null, []);

      // Create system message with conversation context if available
      let systemContent = 'You are a research planning assistant. Analyze the query and create a list of 7-10 insightful bullet points. IMPORTANT FORMAT INSTRUCTIONS: Each bullet point must be a single, clear, natural sentence. Do not include any headings, section titles, prefixes, meta-labels, or special formatting. Do not use colons or numbering at the start of bullet points. Do not include phrases like "Sub-question:", "Research Strategy:", "Key Concepts:", etc. Do not use markdown formatting. Only output plain, natural sentences as bullet points. Do not repeat or rephrase the same point. Consider all relevant information needs, possible interpretations, and research approaches for the query, but present them as simple, direct sentences.';
      
      // Add conversation context if there's history
      if (conversationHistory.previousQueries.length > 0) {
        systemContent += '\n\nThis is a follow-up question to a previous conversation. Here is the conversation history:';
        for (let i = 0; i < conversationHistory.previousQueries.length; i++) {
          systemContent += `\n\nPrevious Question: ${conversationHistory.previousQueries[i]}`;
          if (conversationHistory.previousResponses[i]) {
            systemContent += `\nPrevious Answer Summary: ${summarizeResponse(conversationHistory.previousResponses[i])}`;
          }
        }
        systemContent += '\n\nConsider this history when analyzing the new query. Determine if this is a follow-up question that refers to entities or concepts from previous questions.';
      }

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: query }
          ],
          temperature: 0.2
        })
      });

      let aiContent = '';
      let currentBulletPoint = '';
      let bulletPoints: string[] = [];

      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.text || parsed.content || '';
                  if (delta) {
                    aiContent += delta;
                    currentBulletPoint += delta;
                    
                    // Check if we've completed a sentence
                    if (delta.match(/[.!?](\s|$)/) && currentBulletPoint.trim().length > 0) {
                      const point = currentBulletPoint.trim();
                      if (point.length > 10 && /^[A-Z]/.test(point)) {
                        bulletPoints.push(point);
                        // Update the step with the new bullet point
                        updateStepStatus('understand', 'active', aiContent, null, bulletPoints);
                      }
                      currentBulletPoint = '';
                    }
                  }
                } catch (err) {
                  // Ignore parse errors for incomplete lines
                }
              }
            }
          }
        }
      } else {
        // Handle regular JSON response
        const data = await response.json();
        aiContent = data.content || data.choices?.[0]?.message?.content || data.generated_text || '';
      }

      // Process the final content to ensure it's properly formatted
      const processedContent = aiContent
        .replace(/#{1,6}\s.*/g, '') // Remove all headings
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italics
        .replace(/__(.*?)__/g, '$1') // Remove underline
        .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
        .replace(/```([\s\S]*?)```/g, '') // Remove code blocks entirely
        .replace(/`(.*?)`/g, '$1') // Remove inline code
        .replace(/\[[^\]]+\]\([^)]+\)/g, '') // Remove links
        .replace(/!\[[^\]]+\]\([^)]+\)/g, ''); // Remove images

      updateStepStatus('understand', 'completed', processedContent, processedContent);
      // Move to research step
      processResearchStep(query, processedContent);
    } catch (err: any) {
      handleError('understand', err.message);
    }
  };

  // Step 2: Research - Fetch web data based on AI's analysis
  const processResearchStep = async (query: string, analysis: string) => {
    // First check the global registry
    if (isQueryActive(query)) {
      console.log('[DEBUG] Another component is already processing this query:', query);
      return;
    }
    
    // Then check the local ref (as before)
    if (researchStepCalledRef.current[query]) {
      console.log('[DEBUG] Skipping duplicate research step for:', query);
      return;
    }
    
    // Mark as active globally and locally
    markQueryActive(query);
    researchStepCalledRef.current[query] = true;
    
    console.log('[DEBUG] Running research step for:', query);
    try {
      setActiveStepId('research');
      updateStepStatus('research', 'active', 'Gathering information from multiple sources...');

      // Use the deduplication utility instead of direct fetch
      const serperData = await dedupedSerperRequest(query, 50);

      const newWebData: WebData = {
        serperArticles: serperData.articles || [],
        sources: [...(serperData.sources || [])],
        webCitations: serperData.summary || ''
      };

      setWebData(newWebData);
      
      // Create a summary of found data
      const dataSummary = `Found:\n- ${newWebData.serperArticles.length} web articles`;

      updateStepStatus('research', 'completed', dataSummary, newWebData);
      
      // Move to synthesis step
      processSynthesisStep(query, analysis, newWebData);
    } catch (err: any) {
      handleError('research', err.message);
    } finally {
      // Mark as inactive globally when done (important!)
      markQueryInactive(query);
    }
  };

  // Step 3: Synthesis - Generate final response
  const processSynthesisStep = async (query: string, analysis: string, webData: WebData) => {
    try {
      setActiveStepId('synthesize');
      updateStepStatus('synthesize', 'active', 'Synthesizing a detailed research report...');

      // Prepare system content with conversation context if available
      let systemContent = `You are tasked with creating an in-depth, research-driven response that synthesizes web search results into a comprehensive analysis. Follow these requirements precisely:
Structure Requirements
1. Introduction Paragraph

Craft a compelling, context-setting introduction that clearly defines the scope and key dimensions of your analysis
Establish the significance and relevance of the topic
Preview the main areas of investigation without revealing conclusions
Strict requirement: No citations in the introduction section

2. Dynamic Main Content Sections (3-5 sections)
Content Development:

Analyze web results to identify the most significant themes, trends, controversies, or perspectives
Create section titles that reflect substantive topics, not generic categories
Prioritize current developments, expert opinions, statistical data, and emerging patterns

Section Structure:

Each section must synthesize information from multiple sources
Use a mix of bullet points for key facts and short paragraphs for complex explanations
Include specific data points, quotes from experts, statistical trends, and concrete examples
Maintain analytical depth while ensuring readability

Citation Protocol:

Use numbered citations [1], [2], [3] etc. immediately after relevant statements
Every significant claim, statistic, or expert opinion must be cited
Citations should correspond directly to provided web search results
Balance citation frequency to maintain flow while ensuring credibility

3. Adaptive Summary Table
Dynamic Structure:

Design table columns and rows based on the actual content discovered, not predetermined templates
Examples of adaptive approaches:

Comparative analysis: "Factor | Position A | Position B | Evidence"
Trend analysis: "Time Period | Key Development | Impact Level | Source"
Stakeholder analysis: "Group | Primary Concern | Proposed Solution | Status"
Geographic analysis: "Region | Current Status | Challenges | Opportunities"


Ensure 4-8 rows with substantive information
Include quantitative data where available

4. Conclusion

Synthesize findings into 2-3 key overarching insights
Identify implications, future directions, or unresolved questions
Avoid introducing new information
Strict requirement: No citations in conclusion

Quality Standards
Research Depth

Demonstrate comprehensive understanding by connecting information across sources
Identify contradictions, debates, or knowledge gaps in the available information
Highlight both consensus views and divergent perspectives

Analytical Rigor

Go beyond surface-level reporting to provide interpretation and context
Connect current findings to broader trends or historical patterns
Assess credibility and limitations of different sources when relevant

Source Integration

Seamlessly weave information from multiple sources into coherent narratives
Avoid simply listing information source by source
Create new insights through synthesis rather than mere aggregation

Technical Requirements
Formatting Standards

Use proper markdown syntax throughout
Ensure tables are properly formatted and readable
Use bullet points strategically for emphasis and clarity

Citation Management

Maintain numerical sequence [1], [2], [3] throughout the document
Ensure every citation number corresponds to an actual web search result
Never invent or fabricate source information
Group related information from the same source when appropriate

Response Specifications

Target length: 750-800 words by default (may vary based on topic complexity)
Demonstrate sophisticated vocabulary and sentence structure
Maintain professional, analytical tone throughout
Ensure logical flow between sections

Error Prevention
Common Pitfalls to Avoid

Generic section titles like "Overview" or "Background"
Repetitive information across sections
Uncited claims or statistics
Tables that don't add meaningful value
Conclusions that merely restate previous points
Citations in introduction or conclusion sections

Quality Assurance

Verify that each section contributes unique value
Ensure table structure genuinely reflects the content discovered
Confirm all numerical citations correspond to actual sources
Check that synthesis demonstrates analytical thinking, not just compilation

Adaptation Guidelines
This framework should flex to accommodate diverse topic types:

Breaking news: Focus on timeline, stakeholder reactions, implications
Scientific developments: Emphasize methodology, peer review, applications
Market analysis: Highlight trends, competitive dynamics, financial data
Policy issues: Examine multiple perspectives, implementation challenges, outcomes
Technological advances: Cover capabilities, limitations, adoption barriers
Educational research: Examine pedagogical approaches, student outcomes, institutional impacts
Health and medical topics: Balance clinical evidence, public health implications, expert recommendations
Environmental issues: Include scientific data, policy responses, economic considerations
Social trends: Analyze demographic patterns, cultural shifts, behavioral changes
Business strategy: Focus on competitive positioning, market opportunities, risk factors
Legal developments: Cover precedent analysis, regulatory impact, stakeholder effects
Cultural phenomena: Explore societal significance, historical context, cross-cultural perspectives

The goal is to produce authoritative, insightful analysis that demonstrates both breadth of research and depth of understanding, creating value beyond what individual sources provide alone.`;

      // Add conversation context if there's history
      if (conversationHistory.previousQueries.length > 0) {
        systemContent += '\n\nCONVERSATION CONTEXT:';
        systemContent += '\nThis is a follow-up question to a previous conversation. Consider this history when formulating your response:';
        for (let i = 0; i < conversationHistory.previousQueries.length; i++) {
          systemContent += `\n- Previous Query: "${conversationHistory.previousQueries[i]}"`;
        }
        systemContent += '\n\nIMPORTANT: Maintain the same output structure as specified above, even when answering follow-up questions.';
      }

      // Step 3b: Get the full research-paper style answer from the AI
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: `Query: ${query}\n\nAnalysis: ${analysis}\n\nWeb Data: ${JSON.stringify(webData)}` }
          ],
          temperature: 0.2
        })
      });

      let aiContent = '';
      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.text || parsed.content || '';
                  if (delta) aiContent += delta;
                } catch (err) {
                  // Ignore parse errors for incomplete lines
                }
              }
            }
          }
        }
      } else {
        const data = await response.json();
        aiContent = data.content || data.choices?.[0]?.message?.content || data.generated_text || '';
      }
      updateStepStatus('synthesize', 'completed', aiContent, aiContent);
      setIsComplete(true);
      setIsInProgress(false);
    } catch (err: any) {
      handleError('synthesize', err.message);
    }
  };

  // Helper function to summarize previous responses
  const summarizeResponse = (response: string): string => {
    // Extract main topics from the response
    const sections: string[] = [];
    
    // Get introduction (first paragraph)
    const introMatch = response.match(/^([^#]+?)(?=\n*##|$)/);
    if (introMatch) {
      sections.push(introMatch[0].trim().substring(0, 150) + (introMatch[0].length > 150 ? '...' : ''));
    }
    
    // Get section headings
    const sectionHeadings = response.match(/##\s+([^\n]+)/g);
    if (sectionHeadings) {
      sections.push('Sections covered: ' + sectionHeadings
        .map(h => h.replace(/^##\s+/, ''))
        .filter(h => !h.includes('Summary Table') && !h.includes('Conclusion'))
        .join(', '));
    }
    
    return sections.join(' ');
  };

  // Helper to update step status and content
  const updateStepStatus = (
    stepId: string,
    status: 'pending' | 'active' | 'completed',
    content: string,
    output: any = null,
    streamedContent: string[] = []
  ) => {
    setSteps(prevSteps => prevSteps.map(step => {
      if (step.id === stepId) {
        return {
          ...step,
          status,
          content,
          output,
          streamedContent
        };
      }
      return step;
    }));
  };

  // Helper to handle errors
  const handleError = (stepId: string, errorMessage: string) => {
    setError(`Error in ${stepId} step: ${errorMessage}`);
    updateStepStatus(stepId, 'pending', `Error: ${errorMessage}`);
    setIsInProgress(false);
  };

  return {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  };
}; 