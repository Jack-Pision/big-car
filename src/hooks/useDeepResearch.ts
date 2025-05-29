import { useState, useEffect } from 'react';
import { extractRedditUsername } from '@/utils/reddit-api';

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

export const useDeepResearch = (isActive: boolean, query: string = '', conversationHistory: ResearchConversation = { previousQueries: [], previousResponses: [] }) => {
  const [steps, setSteps] = useState<ThinkingStep[]>([...DEFAULT_THINKING_STEPS]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);
  const [webData, setWebData] = useState<WebData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset everything when a new query starts
  useEffect(() => {
    if (query && isActive && !isInProgress) {
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
  }, [query, isActive, conversationHistory]);

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
    try {
      setActiveStepId('research');
      updateStepStatus('research', 'active', 'Gathering information from multiple sources...');

      // Fetch from all sources in parallel
      const serperRes = await fetch('/api/serper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 })
      });

      const serperData = await serperRes.json();

      const newWebData: WebData = {
        serperArticles: serperData.articles || [],
        sources: [...(serperData.sources || [])],
        webCitations: serperData.summary || ''
      };

      setWebData(newWebData);
      
      // Create a summary of found data
      const dataSummary = `Found:
- ${newWebData.serperArticles.length} web articles`;

      updateStepStatus('research', 'completed', dataSummary, newWebData);
      
      // Move to synthesis step
      processSynthesisStep(query, analysis, newWebData);
    } catch (err: any) {
      handleError('research', err.message);
    }
  };

  // Step 3: Synthesis - Generate final response
  const processSynthesisStep = async (query: string, analysis: string, webData: WebData) => {
    try {
      setActiveStepId('synthesize');
      updateStepStatus('synthesize', 'active', 'Synthesizing a detailed research report...');

      // Prepare system content with conversation context if available
      let systemContent = `You are a Deep Research AI assistant. Use the provided web data to create a comprehensive, well-structured response.

IMPORTANT STRUCTURE REQUIREMENTS - YOUR RESPONSE MUST FOLLOW THIS EXACT FORMAT:

1. START WITH AN INTRODUCTION (NO HEADING):
   - Write a clear 4-5 sentence paragraph that introduces the topic.
   - DO NOT include any citations in this introduction paragraph.
   - DO NOT add any heading before this introduction.
   - DO NOT repeat this introduction text later in the document.

2. MAIN CONTENT SECTIONS:
   - Add 2-4 sections with clear ## Section Headers.
   - Under each section header, include 2-3 bullet points.
   - Format each bullet point as: "- **Key Term/Concept**: Detailed explanation in 3-4 sentences [1]."
   - Place all citations at the END of bullet points, not in the middle of sentences.
   - Start each bullet with a bolded term or phrase.

3. SUMMARY TABLE:
   - Include a "## Summary Table" section with a markdown table.
   - Use 3-4 rows maximum with clear headers.
   - Format: | Category | Information | Source |
   - Keep table entries concise - no more than 10-15 words per cell.
   - DO NOT use markdown formatting inside table cells.

4. CONCLUSION:
   - End with a "## Conclusion" section.
   - Write a concise 4-5 sentence paragraph summarizing key points.
   - DO NOT include new information or citations in the conclusion.

CITATION INSTRUCTIONS:
- Use numbered references like [1], [2], etc. at the END of bullet points only.
- DO NOT include citations in the introduction or conclusion paragraphs.
- DO NOT include a 'References' section at the end.

FORMATTING GUIDANCE:
- Maximum word count: 500 words.
- Use clear, concise language without jargon.
- Maintain consistent formatting throughout.
- Ensure proper spacing between sections.
- No run-on sentences or paragraphs.
- Each bullet point should be a cohesive paragraph, not a single line.
- Don't use any meta-language (like "According to the web search").`;

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
      updateStepStatus('synthesize', 'completed', 'Response ready!', aiContent);
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