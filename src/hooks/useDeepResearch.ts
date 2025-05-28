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

export const useDeepResearch = (isActive: boolean, query: string = '') => {
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
      processUnderstandStep(query);
    }
    
    if (!isActive) {
      setIsInProgress(false);
      setIsComplete(false);
    }
  }, [query, isActive]);

  // Step 1: Understanding - Call AI to analyze the query
  const processUnderstandStep = async (query: string) => {
    try {
      setActiveStepId('understand');
      updateStepStatus('understand', 'active', 'Analyzing your query...', null, []);

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a research planning assistant. Analyze the query and create a list of 7-10 insightful bullet points. IMPORTANT FORMAT INSTRUCTIONS: Each bullet point must be a single, clear, natural sentence. Do not include any headings, section titles, prefixes, meta-labels, or special formatting. Do not use colons or numbering at the start of bullet points. Do not include phrases like "Sub-question:", "Research Strategy:", "Key Concepts:", etc. Do not use markdown formatting. Only output plain, natural sentences as bullet points. Do not repeat or rephrase the same point. Consider all relevant information needs, possible interpretations, and research approaches for the query, but present them as simple, direct sentences.' },
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

      // Step 3b: Get the full research-paper style answer from the AI
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: `You are a Deep Research AI assistant. Use the provided web data to create a comprehensive, well-structured response.

IMPORTANT: Your answer MUST be between 450 and 500 words by default. If the user specifically requests more, you may exceed this range, but otherwise do not write more than 500 words. Do not write less than 450 words.

STRICT RELEVANCE REQUIREMENT:
- Only use information from the provided web data and the user's topic.
- Do NOT include any information, facts, or content that is not present in the web data or directly relevant to the user's query.
- Be concise and avoid unnecessary elaboration or unrelated content.

BULLET POINT DETAIL REQUIREMENT:
For each bullet point, write a detailed, self-contained summary (**7–8 sentences**) that explains the topic, provides context, and includes key facts or findings. Do not use single-sentence or headline-style bullets. Each bullet should be a mini-paragraph of 7–8 sentences.

CONCLUSION REQUIREMENT:
The conclusion section must be a detailed, thoughtful paragraph of at least **7–8 sentences**, thoroughly summarizing the findings and providing additional insights or implications.

FORMATTING REQUIREMENTS:
1. Your response MUST follow a professional, well-structured format like a research document or report.
2. Start with a clear main title using # heading (e.g., "# Latest Developments in AI, 2025").
3. Divide content into logical sections with ## headings.
4. Use bullet points (*) for all key details and findings, with each bullet point being a 7–8 sentence paragraph.
5. End with a "## Conclusion" section that is a detailed 7–8 sentence paragraph.
6. Include a "## Summary Table" if the information can be presented in tabular form.
7. For citations, use ONLY numbered references in square brackets [1], [2] at the end of sentences/bullets.

CITATION INSTRUCTIONS:
- Use ONLY the provided search results as your web sources.
- Do NOT use or invent any other web links.
- When citing, use numbered references like [1], [2], etc. at the end of sentences or bullet points.
- Do not include a 'References' section at the end - only use in-text citations.` },
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