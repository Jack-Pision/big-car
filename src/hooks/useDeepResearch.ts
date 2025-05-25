import { useState, useEffect } from 'react';
import { ThinkingStep } from '@/components/DeepResearchView';
import { extractRedditUsername } from '@/utils/reddit-api';

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
    "Searching through Serper, Wikipedia, and NewsData.io for authoritative sources.",
    "Gathering and filtering the most relevant information from trusted sources.",
    "Cross-referencing information across multiple sources for accuracy."
  ],
  synthesize: [
    "Organizing the research into a clear, structured response.",
    "Creating detailed, informative sections with proper citations.",
    "Ensuring comprehensive coverage of all aspects of your query."
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
  wikipediaArticles: any[];
  newsdataArticles: any[];
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
      updateStepStatus('understand', 'active', 'Analyzing your query...');

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a research planning assistant. Analyze the query and create a detailed research plan. What information is needed? What are the key concepts? What sources should be prioritized?' },
            { role: 'user', content: query }
          ],
          temperature: 0.2
        })
      });

      let aiContent = '';
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
                  if (delta) aiContent += delta;
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
      updateStepStatus('understand', 'completed', aiContent, aiContent);
      // Move to research step
      processResearchStep(query, aiContent);
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
      const [serperRes, wikiRes, newsRes] = await Promise.all([
        fetch('/api/serper/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 10 })
        }),
        fetch('/api/wikipedia/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 8 })
        }),
        fetch('/api/newsdata/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 8 })
        })
      ]);

      const [serperData, wikiData, newsData] = await Promise.all([
        serperRes.json(),
        wikiRes.json(),
        newsRes.json()
      ]);

      const newWebData: WebData = {
        serperArticles: serperData.articles || [],
        wikipediaArticles: wikiData.articles || [],
        newsdataArticles: newsData.articles || [],
        sources: [...(serperData.sources || [])],
        webCitations: serperData.summary || ''
      };

      setWebData(newWebData);
      
      // Create a summary of found data
      const dataSummary = `Found:
- ${newWebData.serperArticles.length} web articles
- ${newWebData.wikipediaArticles.length} Wikipedia entries
- ${newWebData.newsdataArticles.length} news articles`;

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
      updateStepStatus('synthesize', 'active', 'Creating your comprehensive response...');

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a Deep Research AI assistant. Use the provided web data to create a comprehensive, well-structured response.' },
            { role: 'user', content: `Query: ${query}\n\nAnalysis: ${analysis}\n\nWeb Data: ${JSON.stringify(webData)}` }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) throw new Error('Failed to synthesize response');
      const data = await response.json();

      updateStepStatus('synthesize', 'completed', 'Response ready!', data.content);
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
    output: any = null
  ) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId
        ? { ...step, status, content, output }
        : step
    ));
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