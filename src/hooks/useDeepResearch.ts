import { useState, useEffect } from 'react';
import { ThinkingStep } from '@/components/DeepResearchView';
import { extractRedditUsername } from '@/utils/reddit-api';

// Default thinking steps that will be used for every query
const DEFAULT_THINKING_STEPS: ThinkingStep[] = [
  {
    id: 'clarify',
    title: 'Clarifying the Question',
    content: '',
    status: 'pending'
  },
  {
    id: 'background',
    title: 'Gathering Background Information',
    content: '',
    status: 'pending'
  },
  {
    id: 'sources',
    title: 'Identifying Key Sources',
    content: '',
    status: 'pending'
  },
  {
    id: 'reddit',
    title: 'Analyzing Reddit User Data',
    content: '',
    status: 'pending'
  },
  {
    id: 'redditSearch',
    title: 'Searching Reddit Discussions',
    content: '',
    status: 'pending'
  },
  {
    id: 'arguments',
    title: 'Evaluating Different Arguments',
    content: '',
    status: 'pending'
  },
  {
    id: 'synthesis',
    title: 'Synthesizing Information',
    content: '',
    status: 'pending'
  },
  {
    id: 'conclusion',
    title: 'Forming Conclusions',
    content: '',
    status: 'pending'
  },
];

const STEP_TIMINGS = {
  clarify: { min: 3000, max: 5000 },
  background: { min: 4000, max: 7000 },
  sources: { min: 3000, max: 6000 },
  reddit: { min: 3000, max: 6000 },
  redditSearch: { min: 3000, max: 6000 },
  arguments: { min: 5000, max: 8000 },
  synthesis: { min: 4000, max: 7000 },
  conclusion: { min: 3000, max: 5000 },
};

const THINKING_CONTENT = {
  clarify: [
    "The question is about \"{query}\", which I need to understand clearly.",
    "I'm trying to determine what \"{query}\" is asking for specifically.",
    "Let me break down what \"{query}\" means and what information would be most helpful."
  ],
  search: [
    "Searching for the most relevant and reliable information about \"{query}\".",
    "Looking for authoritative sources that can provide accurate data on \"{query}\".",
    "Gathering different perspectives and approaches related to \"{query}\"."
  ],
  analyze: [
    "Evaluating the quality and relevance of the information I've found.",
    "Comparing different sources and identifying consensus views on \"{query}\".",
    "Prioritizing the most important and accurate information for my response."
  ],
  refine: [
    "Organizing the information into a clear structure for my response.",
    "Deciding how to present technical details at an appropriate level.",
    "Ensuring my explanation addresses all aspects of \"{query}\"."
  ],
  finalize: [
    "Adding important details and examples to strengthen my explanation.",
    "Checking that my response is comprehensive and addresses the core question.",
    "Making sure my answer is both accurate and useful for the specific query."
  ],
  confirm: [
    "Verifying that all parts of \"{query}\" have been addressed.",
    "Ensuring the response is complete and covers all relevant angles.",
    "Checking for any gaps or areas that need further explanation."
  ]
};

// Function to get a random thinking content with the query injected
const getRandomThinkingContent = (stepId: string, query: string): string => {
  const contents = THINKING_CONTENT[stepId as keyof typeof THINKING_CONTENT] || [];
  const randomIndex = Math.floor(Math.random() * contents.length);
  let content = contents[randomIndex]?.replace(/\{query\}/g, query) || '';

  // For the Reddit user analysis step
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
## Checking for Reddit User Data

The query doesn't appear to contain a specific Reddit username. Skipping detailed Reddit user analysis.
      `;
    }
  }
  
  // For the Reddit topic search step
  if (stepId === 'redditSearch') {
    content = `
## Searching Reddit for Real-Time Discussions

I'm searching Reddit for discussions about "${query}" to gather:

- Current community perspectives
- Real-world experiences and examples
- Common questions and misconceptions
- Recent developments not in my training data
- Popular opinions and viewpoints
- Expert insights from specialized communities

This will enhance my response with up-to-date, real-world information.
    `;
  }

  return content;
};

// Random time between min and max
const getRandomTime = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const useDeepResearch = (isActive: boolean, query: string = '') => {
  const [steps, setSteps] = useState<ThinkingStep[]>([...DEFAULT_THINKING_STEPS]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [detailedThinking, setDetailedThinking] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);

  // Reset steps when a new query starts
  useEffect(() => {
    if (query && isActive && !isInProgress) {
      // Check if the query contains a Reddit username
      const username = extractRedditUsername(query);
      
      // If no Reddit username is found, remove the Reddit user step
      // But always keep the redditSearch step for topic search
      const filteredSteps = username 
        ? [...DEFAULT_THINKING_STEPS]
        : DEFAULT_THINKING_STEPS.filter(step => step.id !== 'reddit');
      
      setSteps(filteredSteps);
      setActiveStepId(null);
      setDetailedThinking('');
      setIsComplete(false);
      setIsInProgress(true);
      
      // Start the thinking process after a short delay
      setTimeout(() => {
        setActiveStepId('clarify');
        setDetailedThinking(getRandomThinkingContent('clarify', query));
        processNextStep('clarify', 0);
      }, 500);
    }
    
    // When DeepResearch is turned off, reset everything
    if (!isActive) {
      setIsInProgress(false);
      setIsComplete(false);
    }
  }, [query, isActive]);

  // Process steps in sequence
  const processNextStep = (currentStepId: string, stepIndex: number) => {
    if (!isActive || stepIndex >= steps.length) {
      setIsComplete(true);
      setIsInProgress(false);
      return;
    }

    // Mark current step as active
    setSteps(prev => prev.map(step => 
      step.id === currentStepId 
        ? { ...step, status: 'active', content: getRandomThinkingContent(step.id, query) } 
        : step
    ));
    
    // After some time, mark the current step as completed and move to the next
    const timing = STEP_TIMINGS[currentStepId as keyof typeof STEP_TIMINGS] || { min: 2000, max: 4000 };
    const stepTime = getRandomTime(timing.min, timing.max);
    
    setTimeout(() => {
      // Complete the current step
      setSteps(prev => prev.map(step => 
        step.id === currentStepId ? { ...step, status: 'completed' } : step
      ));
      
      // Move to the next step
      if (stepIndex + 1 < steps.length) {
        const nextStep = steps[stepIndex + 1];
        setActiveStepId(nextStep.id);
        setDetailedThinking(getRandomThinkingContent(nextStep.id, query));
        processNextStep(nextStep.id, stepIndex + 1);
      } else {
        setIsComplete(true);
        setIsInProgress(false);
      }
    }, stepTime);
  };

  return {
    steps,
    activeStepId,
    detailedThinking,
    isComplete,
    isInProgress
  };
}; 